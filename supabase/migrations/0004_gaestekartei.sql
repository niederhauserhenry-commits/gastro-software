-- Schritt 6: Gästekartei
-- Jeder Gast bekommt ab der ersten Reservierung eine Karteikarte.
-- Hausgäste (Hotelrestaurant) werden über Aufenthalte mit Zimmer gekennzeichnet.
-- Allergien sind Gesundheitsdaten: Sie dürfen nur mit Einwilligung gespeichert werden.

-- Telefonnummern vergleichbar machen: "0151 234-567" und "+49151234567"
-- ergeben dieselbe Nummer. Ohne Landesvorwahl wird Deutschland angenommen.
create function public.telefon_normal(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when n = '' then ''
    when n like '+%' then n
    when n like '00%' then '+' || substr(n, 3)
    when n like '0%' then '+49' || substr(n, 2)
    else n
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g') as n) x;
$$;

create table public.gaeste (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  telefon text not null default '' check (char_length(telefon) <= 40),
  telefon_norm text generated always as (public.telefon_normal(telefon)) stored,
  email text not null default '' check (char_length(email) <= 120),
  geburtstag date,
  vorlieben text not null default '' check (char_length(vorlieben) <= 500),
  notizen text not null default '' check (char_length(notizen) <= 1000),
  allergien text not null default '' check (char_length(allergien) <= 300),
  allergien_einwilligung_am timestamptz,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  -- Allergien nur mit dokumentierter Einwilligung des Gastes.
  check (allergien = '' or allergien_einwilligung_am is not null),
  unique (id, restaurant_id)
);
-- Eine Telefonnummer gehört pro Restaurant zu genau einer Karteikarte.
create unique index gaeste_telefon_idx on public.gaeste (restaurant_id, telefon_norm) where telefon_norm <> '';
create index gaeste_name_idx on public.gaeste (restaurant_id, lower(name));

-- Aufenthalte von Hausgästen (Hotelrestaurant).
create table public.aufenthalte (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  gast_id uuid not null,
  zimmer text not null default '' check (char_length(zimmer) <= 20),
  anreise date not null,
  abreise date not null,
  check (abreise >= anreise),
  foreign key (gast_id, restaurant_id) references public.gaeste (id, restaurant_id) on delete cascade
);
create index aufenthalte_gast_idx on public.aufenthalte (gast_id);
create index aufenthalte_zeit_idx on public.aufenthalte (restaurant_id, anreise, abreise);

-- Reservierungen zeigen auf die Karteikarte. Wird ein Gast gelöscht,
-- bleibt die Reservierung ohne Verweis bestehen.
alter table public.reservierungen add column gast_id uuid;
alter table public.reservierungen add constraint reservierungen_gast_fk
  foreign key (gast_id, restaurant_id) references public.gaeste (id, restaurant_id) on delete set null (gast_id);
create index reservierungen_gast_idx on public.reservierungen (gast_id);

-- Zugriffsregeln ---------------------------------------------------------------
-- Das ganze Team liest die Kartei (der Service braucht sie am Tisch).
-- Wer reservieren darf, legt Gäste an und pflegt sie. Löschen darf nur die Leitung.
alter table public.gaeste enable row level security;
alter table public.aufenthalte enable row level security;

create policy gaeste_lesen on public.gaeste
  for select to authenticated using (public.ist_mitglied(restaurant_id));
create policy gaeste_anlegen on public.gaeste
  for insert to authenticated with check (public.darf_reservieren(restaurant_id));
create policy gaeste_aendern on public.gaeste
  for update to authenticated using (public.darf_reservieren(restaurant_id))
  with check (public.darf_reservieren(restaurant_id));
create policy gaeste_loeschen on public.gaeste
  for delete to authenticated using (public.ist_leitung(restaurant_id));

create policy aufenthalte_lesen on public.aufenthalte
  for select to authenticated using (public.ist_mitglied(restaurant_id));
create policy aufenthalte_anlegen on public.aufenthalte
  for insert to authenticated with check (public.darf_reservieren(restaurant_id));
create policy aufenthalte_loeschen on public.aufenthalte
  for delete to authenticated using (public.darf_reservieren(restaurant_id));

revoke all on public.gaeste, public.aufenthalte from anon, authenticated;
grant select, delete on public.gaeste to authenticated;
grant insert (restaurant_id, name, telefon, email, geburtstag, vorlieben, notizen, allergien, allergien_einwilligung_am)
  on public.gaeste to authenticated;
-- Das Restaurant einer Karteikarte lässt sich nicht nachträglich ändern.
grant update (name, telefon, email, geburtstag, vorlieben, notizen, allergien, allergien_einwilligung_am)
  on public.gaeste to authenticated;
grant select, insert, delete on public.aufenthalte to authenticated;

create function public.gaeste_geaendert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.geaendert_am := now();
  -- Werden die Allergien geleert, verfällt auch die Einwilligung.
  if new.allergien = '' then
    new.allergien_einwilligung_am := null;
  end if;
  return new;
end;
$$;
create trigger gaeste_geaendert before update on public.gaeste
  for each row execute function public.gaeste_geaendert();

-- Kennzahlen einer Karteikarte ------------------------------------------------
-- Ein Besuch ist eine Reservierung, bei der die Gäste wirklich da waren.
create function public.gaeste_liste(p_restaurant uuid, p_suche text default '', p_filter text default 'alle')
returns table (
  id uuid, name text, telefon text, besuche integer, letzter_besuch date,
  allergien text, ist_hausgast boolean, zimmer text
)
language sql stable set search_path = '' as $$
  with r as (select zeitzone from public.restaurants where id = p_restaurant),
  heute as (select (now() at time zone (select zeitzone from r))::date as tag),
  kennzahlen as (
    select g.id, g.name, g.telefon, g.allergien, g.erstellt_am,
      (select count(*) from public.reservierungen a
        where a.gast_id = g.id and a.status in ('angekommen', 'abgeschlossen'))::integer as besuche,
      (select max((a.beginn at time zone (select zeitzone from r))::date) from public.reservierungen a
        where a.gast_id = g.id and a.status in ('angekommen', 'abgeschlossen')) as letzter_besuch,
      (select f.zimmer from public.aufenthalte f
        where f.gast_id = g.id and (select tag from heute) between f.anreise and f.abreise
        order by f.anreise desc limit 1) as zimmer
    from public.gaeste g
    where g.restaurant_id = p_restaurant
      and (coalesce(btrim(p_suche), '') = ''
        or g.name ilike '%' || btrim(p_suche) || '%'
        or (public.telefon_normal(p_suche) <> '' and length(public.telefon_normal(p_suche)) >= 4
            and g.telefon_norm like '%' || public.telefon_normal(p_suche) || '%'))
  )
  select k.id, k.name, k.telefon, k.besuche, k.letzter_besuch, k.allergien,
         k.zimmer is not null, coalesce(k.zimmer, '')
  from kennzahlen k
  where p_filter = 'alle'
     or (p_filter = 'stammgaeste' and k.besuche >= 5)
     or (p_filter = 'hausgaeste' and k.zimmer is not null)
  order by k.letzter_besuch desc nulls last, k.erstellt_am desc
  limit 200;
$$;

-- Reservierungen: Buchung legt die Karteikarte an oder verknüpft sie ------------
drop function public.reservierung_anlegen(uuid, date, time, integer, text, text, uuid, uuid, text, text, public.reservierung_quelle, boolean);

-- Sucht die Karteikarte zu einer Buchung oder legt sie an:
--   1. ausdrücklich gewählter Gast
--   2. sonst derselbe Gast über die Telefonnummer
--   3. sonst eine neue Karteikarte
create function public.gast_fuer_buchung(p_restaurant uuid, p_gast uuid, p_name text, p_telefon text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_norm text := public.telefon_normal(p_telefon);
begin
  if p_gast is not null then
    select id into v_id from public.gaeste where id = p_gast and restaurant_id = p_restaurant;
    if v_id is null then
      raise exception 'GAST_UNBEKANNT';
    end if;
    -- Neue Telefonnummer übernehmen, wenn die Karteikarte noch keine hat.
    update public.gaeste set telefon = btrim(p_telefon)
      where id = v_id and telefon = '' and v_norm <> ''
        and not exists (select 1 from public.gaeste x where x.restaurant_id = p_restaurant and x.telefon_norm = v_norm);
    return v_id;
  end if;
  if v_norm <> '' then
    select id into v_id from public.gaeste where restaurant_id = p_restaurant and telefon_norm = v_norm;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  insert into public.gaeste (restaurant_id, name, telefon)
    values (p_restaurant, btrim(p_name), btrim(coalesce(p_telefon, '')))
    on conflict (restaurant_id, telefon_norm) where telefon_norm <> '' do update set geaendert_am = now()
    returning id into v_id;
  return v_id;
end;
$$;

create function public.reservierung_anlegen(
  p_restaurant uuid,
  p_datum date,
  p_uhrzeit time,
  p_personen integer,
  p_gast_name text,
  p_telefon text default '',
  p_tisch uuid default null,
  p_durchgang uuid default null,
  p_anlass text default '',
  p_notiz text default '',
  p_quelle public.reservierung_quelle default 'personal',
  p_ausserhalb boolean default false,
  p_gast uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.restaurants%rowtype;
  v_beginn timestamptz;
  v_ende timestamptz;
  v_block_ende timestamptz;
  v_uhrzeit time := p_uhrzeit;
  v_durchgang public.durchgaenge%rowtype;
  v_id uuid;
  v_tisch record;
  v_belegt integer;
  v_gast uuid;
  v_name text := btrim(coalesce(p_gast_name, ''));
begin
  if not public.darf_reservieren(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  select * into r from public.restaurants where id = p_restaurant;
  if p_personen is null or p_personen < 1 or p_personen > 500 then
    raise exception 'ZAHL_UNGUELTIG';
  end if;
  if p_datum is null or p_datum < (now() at time zone r.zeitzone)::date then
    raise exception 'DATUM_VERGANGEN';
  end if;

  -- 1. Beginn und Ende bestimmen, je nach eingestellter Tischdauer.
  if r.dauer_modus = 'durchgaenge' then
    select * into v_durchgang from public.durchgaenge
      where id = p_durchgang and restaurant_id = p_restaurant
        and (wochentag is null or wochentag = extract(isodow from p_datum));
    if v_durchgang.id is null then
      raise exception 'DURCHGANG_FEHLT';
    end if;
    v_uhrzeit := v_durchgang.von;
    v_beginn := (p_datum + v_durchgang.von) at time zone r.zeitzone;
    v_ende := (case when v_durchgang.bis > v_durchgang.von
                 then p_datum + v_durchgang.bis else p_datum + 1 + v_durchgang.bis end) at time zone r.zeitzone;
  else
    if v_uhrzeit is null or extract(minute from v_uhrzeit)::int % 15 <> 0 or extract(second from v_uhrzeit) <> 0 then
      raise exception 'ZEIT_RASTER';
    end if;
    v_beginn := (p_datum + v_uhrzeit) at time zone r.zeitzone;
    v_ende := v_beginn + make_interval(mins => r.standard_dauer_minuten);
  end if;

  -- 2. Öffnungszeiten prüfen.
  select block_ende into v_block_ende from public.oeffnungsblock(p_restaurant, p_datum, v_uhrzeit, r.zeitzone);
  if v_block_ende is null and not (p_ausserhalb and p_quelle = 'personal') then
    raise exception 'AUSSERHALB_OEFFNUNGSZEIT';
  end if;
  if r.dauer_modus = 'offen' and v_block_ende is not null and v_block_ende > v_beginn then
    v_ende := v_block_ende;
  end if;

  -- 3. Karteikarte finden oder anlegen. Bei einem gewählten Gast gilt dessen Name.
  v_gast := public.gast_fuer_buchung(p_restaurant, p_gast, v_name, p_telefon);
  if p_gast is not null then
    select name into v_name from public.gaeste where id = v_gast;
  end if;

  -- 4a. Restaurant zählt nur Plätze.
  if r.vergabe_modus = 'plaetze' then
    if r.plaetze_gesamt is null then
      raise exception 'PLAETZE_NICHT_EINGESTELLT';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_restaurant::text, 0));
    select coalesce(max(belegt), 0) into v_belegt from (
      select (select coalesce(sum(a.personen), 0) from public.reservierungen a
              where a.restaurant_id = p_restaurant and a.status in ('bestaetigt', 'angekommen')
                and a.beginn <= z.zeitpunkt and a.ende > z.zeitpunkt) as belegt
      from (
        select v_beginn as zeitpunkt
        union
        select b.beginn from public.reservierungen b
        where b.restaurant_id = p_restaurant and b.status in ('bestaetigt', 'angekommen')
          and b.beginn > v_beginn and b.beginn < v_ende
      ) z
    ) s;
    if v_belegt + p_personen > r.plaetze_gesamt then
      raise exception 'KEIN_PLATZ_FREI';
    end if;
    insert into public.reservierungen
      (restaurant_id, gast_id, gast_name, telefon, personen, beginn, ende, quelle, anlass, notiz, erstellt_von)
      values (p_restaurant, v_gast, v_name, btrim(coalesce(p_telefon, '')), p_personen, v_beginn, v_ende,
              p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), auth.uid())
      returning id into v_id;
    return v_id;
  end if;

  -- 4b. Bestimmter Tisch.
  if p_tisch is not null then
    if not exists (select 1 from public.tische where id = p_tisch and restaurant_id = p_restaurant) then
      raise exception 'TISCH_UNBEKANNT';
    end if;
    begin
      insert into public.reservierungen
        (restaurant_id, tisch_id, gast_id, gast_name, telefon, personen, beginn, ende, quelle, anlass, notiz, erstellt_von)
        values (p_restaurant, p_tisch, v_gast, v_name, btrim(coalesce(p_telefon, '')), p_personen, v_beginn, v_ende,
                p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), auth.uid())
        returning id into v_id;
    exception when exclusion_violation then
      raise exception 'TISCH_BELEGT';
    end;
    return v_id;
  end if;

  -- 4c. Automatisch: kleinster passender freier Tisch.
  for v_tisch in
    select t.id from public.tische t
    where t.restaurant_id = p_restaurant and t.plaetze >= p_personen
      and not exists (
        select 1 from public.reservierungen a
        where a.tisch_id = t.id and a.status in ('bestaetigt', 'angekommen')
          and tstzrange(a.beginn, a.ende) && tstzrange(v_beginn, v_ende))
    order by t.plaetze, t.name
  loop
    begin
      insert into public.reservierungen
        (restaurant_id, tisch_id, gast_id, gast_name, telefon, personen, beginn, ende, quelle, anlass, notiz, erstellt_von)
        values (p_restaurant, v_tisch.id, v_gast, v_name, btrim(coalesce(p_telefon, '')), p_personen, v_beginn, v_ende,
                p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), auth.uid())
        returning id into v_id;
      return v_id;
    exception when exclusion_violation then
      -- Tisch wurde in diesem Moment vergeben, nächsten versuchen.
    end;
  end loop;
  raise exception 'KEIN_TISCH_FREI';
end;
$$;

-- Tagesliste mit Hinweisen aus der Kartei (Besuche, Allergien, Hausgast).
drop function public.reservierungen_am(uuid, date);
create function public.reservierungen_am(p_restaurant uuid, p_datum date)
returns table (
  id uuid, tisch_id uuid, tisch_name text, gast_name text, telefon text, personen integer,
  von text, bis text, von_minuten integer, bis_minuten integer,
  status public.reservierung_status, quelle public.reservierung_quelle, anlass text, notiz text,
  gast_id uuid, besuche integer, allergien text, zimmer text
)
language sql stable set search_path = '' as $$
  select a.id, a.tisch_id, t.name, a.gast_name, a.telefon, a.personen,
    to_char(a.beginn at time zone r.zeitzone, 'HH24:MI'),
    to_char(a.ende at time zone r.zeitzone, 'HH24:MI'),
    (extract(epoch from (a.beginn at time zone r.zeitzone) - p_datum::timestamp) / 60)::integer,
    (extract(epoch from (a.ende at time zone r.zeitzone) - p_datum::timestamp) / 60)::integer,
    a.status, a.quelle, a.anlass, a.notiz,
    a.gast_id,
    coalesce((select count(*) from public.reservierungen b
      where b.gast_id = a.gast_id and b.status in ('angekommen', 'abgeschlossen'))::integer, 0),
    coalesce(g.allergien, ''),
    coalesce((select f.zimmer from public.aufenthalte f
      where f.gast_id = a.gast_id and p_datum between f.anreise and f.abreise
      order by f.anreise desc limit 1), '')
  from public.reservierungen a
  join public.restaurants r on r.id = a.restaurant_id
  left join public.tische t on t.id = a.tisch_id
  left join public.gaeste g on g.id = a.gast_id
  where a.restaurant_id = p_restaurant
    and (a.beginn at time zone r.zeitzone)::date = p_datum
  order by a.beginn, t.name;
$$;

-- Besuchsverlauf einer Karteikarte, neueste zuerst.
create function public.gast_besuche(p_gast uuid)
returns table (
  id uuid, datum date, von text, personen integer, tisch_name text,
  status public.reservierung_status, anlass text, notiz text
)
language sql stable set search_path = '' as $$
  select a.id, (a.beginn at time zone r.zeitzone)::date, to_char(a.beginn at time zone r.zeitzone, 'HH24:MI'),
    a.personen, t.name, a.status, a.anlass, a.notiz
  from public.reservierungen a
  join public.restaurants r on r.id = a.restaurant_id
  left join public.tische t on t.id = a.tisch_id
  where a.gast_id = p_gast
  order by a.beginn desc
  limit 100;
$$;

-- Löschfrist ---------------------------------------------------------------------
-- Läuft jede Nacht: Karteikarten ohne Besuch innerhalb der Löschfrist werden
-- gelöscht, alte Reservierungen werden anonymisiert.
create function public.gaeste_aufraeumen() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_grenze timestamptz;
begin
  for r in select id, loeschfrist_monate from public.restaurants loop
    v_grenze := now() - make_interval(months => r.loeschfrist_monate);
    update public.reservierungen
      set gast_name = 'Gelöscht', telefon = '', anlass = '', notiz = '', gast_id = null
      where restaurant_id = r.id and ende < v_grenze and gast_name <> 'Gelöscht';
    delete from public.gaeste g
      where g.restaurant_id = r.id
        and g.erstellt_am < v_grenze
        and not exists (select 1 from public.reservierungen a where a.gast_id = g.id and a.ende >= v_grenze)
        and not exists (select 1 from public.aufenthalte f where f.gast_id = g.id and f.abreise >= v_grenze::date);
  end loop;
end;
$$;

revoke execute on function
  public.telefon_normal(text),
  public.gaeste_liste(uuid, text, text),
  public.gast_fuer_buchung(uuid, uuid, text, text),
  public.reservierung_anlegen(uuid, date, time, integer, text, text, uuid, uuid, text, text, public.reservierung_quelle, boolean, uuid),
  public.reservierungen_am(uuid, date),
  public.gast_besuche(uuid),
  public.gaeste_aufraeumen(),
  public.gaeste_geaendert()
  from public, anon;
revoke execute on function public.gaeste_aufraeumen(), public.gast_fuer_buchung(uuid, uuid, text, text) from authenticated;
grant execute on function
  public.telefon_normal(text),
  public.gaeste_liste(uuid, text, text),
  public.reservierung_anlegen(uuid, date, time, integer, text, text, uuid, uuid, text, text, public.reservierung_quelle, boolean, uuid),
  public.reservierungen_am(uuid, date),
  public.gast_besuche(uuid)
  to authenticated;

-- Nächtlichen Lauf einplanen (03:17 Uhr UTC), sofern pg_cron verfügbar ist.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('gaeste-aufraeumen', '17 3 * * *', 'select public.gaeste_aufraeumen()');
exception when others then
  raise notice 'pg_cron nicht verfügbar, Löschfrist muss anders eingeplant werden: %', sqlerrm;
end;
$$;
