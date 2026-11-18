-- Schritt 8: Warteliste
--
-- Ist alles voll, kommt der Gast auf die Warteliste: Datum, Personen und ein
-- Zeitfenster (z. B. 18:00 bis 20:30). Wird ein passender Tisch frei, gibt es
-- zwei Wege, je nach Einstellung des Restaurants:
--   manuell:      Das Team sieht "Frei um 19:30" und trägt den Gast mit einem Klick ein
--                 oder schickt ihm ein Angebot per SMS.
--   automatisch:  Der erste passende Gast mit Telefonnummer bekommt sofort ein
--                 Angebot per SMS mit Link. Sagt er innerhalb der Frist zu, ist der
--                 Tisch gebucht. Sonst ist der Nächste dran.

create type public.warteliste_status as enum ('wartet', 'angeboten', 'gebucht', 'abgelehnt', 'abgelaufen', 'entfernt');
alter type public.nachricht_art add value if not exists 'warteliste';

alter table public.restaurants
  add column vorlage_warteliste text not null
    default '{restaurant}: Ein Tisch ist frei! {datum}, {uhrzeit} Uhr, {personen} Pers. Zusagen innerhalb {minuten} Min.: {link}'
    check (char_length(vorlage_warteliste) between 10 and 300);
grant update (vorlage_warteliste) on public.restaurants to authenticated;

create table public.warteliste (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  gast_id uuid,
  gast_name text not null check (char_length(btrim(gast_name)) between 1 and 80),
  telefon text not null default '' check (char_length(telefon) <= 40),
  personen integer not null check (personen between 1 and 500),
  datum date not null,
  -- Zeitfenster für den Beginn, zum Beispiel 18:00 bis 20:30.
  von time not null,
  bis time not null,
  notiz text not null default '' check (char_length(notiz) <= 300),
  status public.warteliste_status not null default 'wartet',
  angebot_uhrzeit time,
  angebot_durchgang uuid references public.durchgaenge (id) on delete set null,
  angebot_bis timestamptz,
  schluessel text unique,
  reservierung_id uuid references public.reservierungen (id) on delete set null,
  erstellt_von uuid references auth.users (id) on delete set null default auth.uid(),
  erstellt_am timestamptz not null default now(),
  check (bis >= von),
  foreign key (gast_id, restaurant_id) references public.gaeste (id, restaurant_id) on delete set null (gast_id)
);
create index warteliste_tag_idx on public.warteliste (restaurant_id, datum, status);

alter table public.warteliste enable row level security;
create policy warteliste_lesen on public.warteliste
  for select to authenticated using (public.ist_mitglied(restaurant_id));
create policy warteliste_anlegen on public.warteliste
  for insert to authenticated with check (public.darf_reservieren(restaurant_id));
revoke all on public.warteliste from anon, authenticated;
grant select on public.warteliste to authenticated;
grant insert (restaurant_id, gast_name, telefon, personen, datum, von, bis, notiz) on public.warteliste to authenticated;

-- Steht der Gast schon in der Kartei (gleiche Telefonnummer), wird der Eintrag verknüpft.
create function public.warteliste_gast_verknuepfen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.gast_id is null and public.telefon_normal(new.telefon) <> '' then
    select id into new.gast_id from public.gaeste
      where restaurant_id = new.restaurant_id and telefon_norm = public.telefon_normal(new.telefon);
  end if;
  return new;
end;
$$;
create trigger warteliste_gast_verknuepfen before insert on public.warteliste
  for each row execute function public.warteliste_gast_verknuepfen();

-- Nachrichten können jetzt auch zu einem Wartelisten-Eintrag gehören.
alter table public.nachrichten alter column reservierung_id drop not null;
alter table public.nachrichten add column warteliste_id uuid references public.warteliste (id) on delete cascade;
alter table public.nachrichten add constraint nachrichten_bezug check (reservierung_id is not null or warteliste_id is not null);

-- Buchung ohne Rechteprüfung. Wird nur von geprüften Funktionen aufgerufen:
-- reservierung_anlegen (Team) und warteliste_antworten (Gast über den Link).
create function public.reservierung_buchen(
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
  p_gast uuid default null,
  p_erstellt_von uuid default null
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
              p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), p_erstellt_von)
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
                p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), p_erstellt_von)
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
                p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), p_erstellt_von)
        returning id into v_id;
      return v_id;
    exception when exclusion_violation then
      -- Tisch wurde in diesem Moment vergeben, nächsten versuchen.
    end;
  end loop;
  raise exception 'KEIN_TISCH_FREI';
end;
$$;

create or replace function public.reservierung_anlegen(
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
begin
  if not public.darf_reservieren(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  return public.reservierung_buchen(p_restaurant, p_datum, p_uhrzeit, p_personen, p_gast_name, p_telefon,
    p_tisch, p_durchgang, p_anlass, p_notiz, p_quelle, p_ausserhalb, p_gast, auth.uid());
end;
$$;

-- Ist im Zeitraum Platz für so viele Personen?
create function public.zeitraum_frei(p_restaurant uuid, p_beginn timestamptz, p_ende timestamptz, p_personen integer)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.restaurants%rowtype;
  v_belegt integer;
begin
  select * into r from public.restaurants where id = p_restaurant;
  if r.vergabe_modus = 'tische' then
    return exists (
      select 1 from public.tische t
      where t.restaurant_id = p_restaurant and t.plaetze >= p_personen
        and not exists (
          select 1 from public.reservierungen a
          where a.tisch_id = t.id and a.status in ('bestaetigt', 'angekommen')
            and tstzrange(a.beginn, a.ende) && tstzrange(p_beginn, p_ende)));
  end if;
  if r.plaetze_gesamt is null then
    return false;
  end if;
  select coalesce(max(belegt), 0) into v_belegt from (
    select (select coalesce(sum(a.personen), 0) from public.reservierungen a
            where a.restaurant_id = p_restaurant and a.status in ('bestaetigt', 'angekommen')
              and a.beginn <= z.zeitpunkt and a.ende > z.zeitpunkt) as belegt
    from (
      select p_beginn as zeitpunkt
      union
      select b.beginn from public.reservierungen b
      where b.restaurant_id = p_restaurant and b.status in ('bestaetigt', 'angekommen')
        and b.beginn > p_beginn and b.beginn < p_ende
    ) z
  ) s;
  return v_belegt + p_personen <= r.plaetze_gesamt;
end;
$$;

-- Erste Uhrzeit im Zeitfenster eines Eintrags, zu der ein passender Platz frei ist.
-- Bei festen Durchgängen kommt der Durchgang mit.
create function public.warteliste_freie_zeit(p_id uuid)
returns table (uhrzeit time, durchgang uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  w public.warteliste%rowtype;
  r public.restaurants%rowtype;
  d record;
  v_t time;
  v_beginn timestamptz;
  v_ende timestamptz;
  v_block timestamptz;
  v_frueheste timestamptz := now() + interval '10 minutes';
begin
  select * into w from public.warteliste where id = p_id;
  if w.id is null or (auth.uid() is not null and not public.ist_mitglied(w.restaurant_id)) then
    return;
  end if;
  select * into r from public.restaurants where id = w.restaurant_id;

  if r.dauer_modus = 'durchgaenge' then
    for d in
      select * from public.durchgaenge
      where restaurant_id = r.id and (wochentag is null or wochentag = extract(isodow from w.datum))
        and von between w.von and w.bis
      order by von
    loop
      v_beginn := (w.datum + d.von) at time zone r.zeitzone;
      v_ende := (case when d.bis > d.von then w.datum + d.bis else w.datum + 1 + d.bis end) at time zone r.zeitzone;
      if v_beginn > v_frueheste and public.zeitraum_frei(r.id, v_beginn, v_ende, w.personen) then
        uhrzeit := d.von;
        durchgang := d.id;
        return next;
        return;
      end if;
    end loop;
    return;
  end if;

  v_t := w.von;
  loop
    v_beginn := (w.datum + v_t) at time zone r.zeitzone;
    select block_ende into v_block from public.oeffnungsblock(r.id, w.datum, v_t, r.zeitzone);
    if v_block is not null and v_beginn > v_frueheste then
      v_ende := case when r.dauer_modus = 'offen' and v_block > v_beginn then v_block
                     else v_beginn + make_interval(mins => r.standard_dauer_minuten) end;
      if public.zeitraum_frei(r.id, v_beginn, v_ende, w.personen) then
        uhrzeit := v_t;
        durchgang := null;
        return next;
        return;
      end if;
    end if;
    v_t := v_t + interval '15 minutes';
    exit when v_t > w.bis or v_t = time '00:00';
  end loop;
end;
$$;

create function public.warteliste_text(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  select replace(replace(replace(replace(replace(replace(replace(r.vorlage_warteliste,
      '{restaurant}', r.name),
      '{name}', w.gast_name),
      '{datum}', to_char(w.datum, 'DD.MM.')),
      '{uhrzeit}', to_char(w.angebot_uhrzeit, 'HH24:MI')),
      '{personen}', w.personen::text),
      '{minuten}', r.warteliste_frist_minuten::text),
      '{link}', (select wert from public.app_konfiguration where schluessel = 'app_url') || '/w/' || w.schluessel)
    into v
  from public.warteliste w
  join public.restaurants r on r.id = w.restaurant_id
  where w.id = p_id;
  return v;
end;
$$;

-- Schickt einem wartenden Gast ein Angebot per SMS, wenn etwas frei ist.
create function public.warteliste_anbieten(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w public.warteliste%rowtype;
  r public.restaurants%rowtype;
  z record;
begin
  select * into w from public.warteliste where id = p_id for update;
  if w.id is null then
    raise exception 'EINTRAG_UNBEKANNT';
  end if;
  -- Aus dem Team nur mit Freigabe. Ohne Anmeldung kommt der Aufruf vom System.
  if auth.uid() is not null and not public.darf_reservieren(w.restaurant_id) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if w.status <> 'wartet' then
    return false;
  end if;
  if public.telefon_normal(w.telefon) = '' then
    raise exception 'TELEFON_FEHLT';
  end if;
  select * into z from public.warteliste_freie_zeit(p_id) limit 1;
  if z.uhrzeit is null then
    return false;
  end if;
  select * into r from public.restaurants where id = w.restaurant_id;
  update public.warteliste set
    status = 'angeboten',
    angebot_uhrzeit = z.uhrzeit,
    angebot_durchgang = z.durchgang,
    angebot_bis = now() + make_interval(mins => r.warteliste_frist_minuten),
    schluessel = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where id = p_id;
  if r.nachrichten_modus <> 'aus' then
    insert into public.nachrichten (restaurant_id, warteliste_id, art, an, text, senden_ab)
      values (w.restaurant_id, p_id, 'warteliste', public.telefon_normal(w.telefon), public.warteliste_text(p_id), now());
  end if;
  return true;
end;
$$;

-- Im automatischen Modus: dem ersten passenden Gast des Tages ein Angebot schicken.
-- Pro Tag läuft immer nur ein Angebot gleichzeitig.
create function public.warteliste_automatisch(p_restaurant uuid, p_datum date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if (select warteliste_modus from public.restaurants where id = p_restaurant) <> 'automatisch' then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('warteliste' || p_restaurant::text, 0));
  if exists (select 1 from public.warteliste where restaurant_id = p_restaurant and datum = p_datum
             and status = 'angeboten' and angebot_bis > now()) then
    return;
  end if;
  for v in
    select id from public.warteliste
    where restaurant_id = p_restaurant and datum = p_datum and status = 'wartet'
      and public.telefon_normal(telefon) <> ''
    order by erstellt_am
  loop
    if public.warteliste_anbieten(v.id) then
      return;
    end if;
  end loop;
end;
$$;

-- Wird ein Tisch frei (Storno, No-Show, Gäste früher gegangen), ist die Warteliste dran.
create function public.warteliste_bei_freiem_tisch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('bestaetigt', 'angekommen') and new.status in ('storniert', 'nicht_erschienen', 'abgeschlossen') then
    perform public.warteliste_automatisch(new.restaurant_id,
      (new.beginn at time zone (select zeitzone from public.restaurants where id = new.restaurant_id))::date);
  end if;
  return new;
end;
$$;
create trigger warteliste_bei_freiem_tisch after update of status on public.reservierungen
  for each row execute function public.warteliste_bei_freiem_tisch();

-- Läuft jede Minute: abgelaufene Angebote beenden und dem Nächsten anbieten,
-- vergangene Tage aufräumen.
create function public.warteliste_ablauf() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  for v in
    with abgelaufen as (
      update public.warteliste set status = 'abgelaufen'
      where status = 'angeboten' and angebot_bis <= now()
      returning restaurant_id, datum
    )
    select distinct restaurant_id, datum from abgelaufen
  loop
    perform public.warteliste_automatisch(v.restaurant_id, v.datum);
  end loop;
  update public.warteliste w set status = 'abgelaufen'
    from public.restaurants r
    where r.id = w.restaurant_id and w.status = 'wartet' and w.datum < (now() at time zone r.zeitzone)::date;
end;
$$;

-- Das Team trägt einen wartenden Gast direkt ein.
create function public.warteliste_eintragen(p_id uuid, p_uhrzeit time, p_durchgang uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  w public.warteliste%rowtype;
  v_res uuid;
begin
  select * into w from public.warteliste where id = p_id for update;
  if w.id is null or not public.ist_mitglied(w.restaurant_id) then
    raise exception 'EINTRAG_UNBEKANNT';
  end if;
  if w.status not in ('wartet', 'angeboten') then
    raise exception 'STATUS_NICHT_MOEGLICH';
  end if;
  -- reservierung_anlegen prüft die Rechte des Aufrufers.
  v_res := public.reservierung_anlegen(w.restaurant_id, w.datum, p_uhrzeit, w.personen, w.gast_name, w.telefon,
    null, p_durchgang, '', btrim('Von der Warteliste. ' || w.notiz), 'personal', false, w.gast_id);
  update public.warteliste set status = 'gebucht', reservierung_id = v_res where id = p_id;
  return v_res;
end;
$$;

create function public.warteliste_entfernen(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.warteliste%rowtype;
begin
  select * into w from public.warteliste where id = p_id for update;
  if w.id is null or not public.ist_mitglied(w.restaurant_id) then
    raise exception 'EINTRAG_UNBEKANNT';
  end if;
  if not public.darf_reservieren(w.restaurant_id) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if w.status in ('wartet', 'angeboten') then
    update public.warteliste set status = 'entfernt' where id = p_id;
  end if;
end;
$$;

-- Warteliste eines Tages für das Team, mit der nächsten freien Zeit.
create function public.warteliste_tag(p_restaurant uuid, p_datum date)
returns table (
  id uuid, gast_id uuid, gast_name text, telefon text, personen integer, von text, bis text, notiz text,
  status public.warteliste_status, angebot_uhrzeit text, angebot_bis text, freie_zeit text, freier_durchgang uuid,
  reservierung_id uuid
)
language sql stable set search_path = '' as $$
  select w.id, w.gast_id, w.gast_name, w.telefon, w.personen, to_char(w.von, 'HH24:MI'), to_char(w.bis, 'HH24:MI'), w.notiz,
    w.status, to_char(w.angebot_uhrzeit, 'HH24:MI'), to_char(w.angebot_bis at time zone r.zeitzone, 'HH24:MI'),
    case when w.status = 'wartet' then (select to_char(f.uhrzeit, 'HH24:MI') from public.warteliste_freie_zeit(w.id) f) end,
    case when w.status = 'wartet' then (select f.durchgang from public.warteliste_freie_zeit(w.id) f) end,
    w.reservierung_id
  from public.warteliste w
  join public.restaurants r on r.id = w.restaurant_id
  where w.restaurant_id = p_restaurant and w.datum = p_datum
  order by case w.status when 'angeboten' then 0 when 'wartet' then 1 else 2 end, w.erstellt_am;
$$;

-- Öffentlicher Angebots-Link für den Gast ---------------------------------------
create function public.warteliste_per_link(p_schluessel text)
returns table (
  restaurant text, gast_name text, datum date, uhrzeit text, personen integer,
  status public.warteliste_status, gueltig_bis text, offen boolean
)
language sql stable security definer set search_path = '' as $$
  select r.name, w.gast_name, w.datum, to_char(w.angebot_uhrzeit, 'HH24:MI'), w.personen, w.status,
    to_char(w.angebot_bis at time zone r.zeitzone, 'HH24:MI'),
    w.status = 'angeboten' and w.angebot_bis > now()
  from public.warteliste w
  join public.restaurants r on r.id = w.restaurant_id
  where w.schluessel = p_schluessel and length(p_schluessel) = 12;
$$;

create function public.warteliste_antworten(p_schluessel text, p_annehmen boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  w public.warteliste%rowtype;
  v_res uuid;
begin
  select * into w from public.warteliste where schluessel = p_schluessel and length(p_schluessel) = 12 for update;
  if w.id is null then
    return 'UNBEKANNT';
  end if;
  if w.status = 'gebucht' then
    return 'GEBUCHT';
  end if;
  if w.status <> 'angeboten' or w.angebot_bis <= now() then
    return 'ABGELAUFEN';
  end if;
  if not p_annehmen then
    update public.warteliste set status = 'abgelehnt' where id = w.id;
    perform public.warteliste_automatisch(w.restaurant_id, w.datum);
    return 'ABGELEHNT';
  end if;
  begin
    v_res := public.reservierung_buchen(w.restaurant_id, w.datum, w.angebot_uhrzeit, w.personen, w.gast_name, w.telefon,
      null, w.angebot_durchgang, '', btrim('Von der Warteliste. ' || w.notiz), 'web', false, w.gast_id, null);
  exception when others then
    -- In der Zwischenzeit anders vergeben: Der Gast bleibt auf der Liste.
    update public.warteliste set status = 'wartet', angebot_uhrzeit = null, angebot_durchgang = null, angebot_bis = null
      where id = w.id;
    return 'NICHT_MEHR_FREI';
  end;
  update public.warteliste set status = 'gebucht', reservierung_id = v_res where id = w.id;
  return 'GEBUCHT';
end;
$$;

revoke execute on function
  public.warteliste_gast_verknuepfen(),
  public.reservierung_buchen(uuid, date, time, integer, text, text, uuid, uuid, text, text, public.reservierung_quelle, boolean, uuid, uuid),
  public.zeitraum_frei(uuid, timestamptz, timestamptz, integer),
  public.warteliste_freie_zeit(uuid),
  public.warteliste_text(uuid),
  public.warteliste_anbieten(uuid),
  public.warteliste_automatisch(uuid, date),
  public.warteliste_bei_freiem_tisch(),
  public.warteliste_ablauf(),
  public.warteliste_eintragen(uuid, time, uuid),
  public.warteliste_entfernen(uuid),
  public.warteliste_tag(uuid, date),
  public.warteliste_per_link(text),
  public.warteliste_antworten(text, boolean)
  from public, anon, authenticated;
grant execute on function
  public.warteliste_freie_zeit(uuid),
  public.warteliste_anbieten(uuid),
  public.warteliste_eintragen(uuid, time, uuid),
  public.warteliste_entfernen(uuid),
  public.warteliste_tag(uuid, date)
  to authenticated;
grant execute on function public.warteliste_per_link(text), public.warteliste_antworten(text, boolean) to anon, authenticated;

do $$
begin
  perform cron.schedule('warteliste-ablauf', '* * * * *', 'select public.warteliste_ablauf()');
exception when others then
  raise notice 'pg_cron nicht verfügbar: %', sqlerrm;
end;
$$;
