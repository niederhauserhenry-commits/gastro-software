-- Schritt 4: Reservierungen mit Schutz vor Doppelbuchungen
--
-- Grundsatz: Telefon-KI, Webseite und Personal buchen alle über dieselbe
-- Funktion reservierung_anlegen. Die Tabelle selbst ist für Nutzer nur lesbar.
-- Dass ein Tisch nie doppelt belegt wird, garantiert eine Regel der Datenbank
-- (Ausschlussregel), nicht das Programm.

create extension if not exists btree_gist with schema extensions;

create type public.reservierung_status as enum
  ('bestaetigt', 'angekommen', 'abgeschlossen', 'storniert', 'nicht_erschienen');
create type public.reservierung_quelle as enum ('personal', 'telefon_ki', 'web');

create table public.reservierungen (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  -- Leer, wenn das Restaurant nur Plätze zählt.
  tisch_id uuid references public.tische (id) on delete restrict,
  gast_name text not null check (char_length(btrim(gast_name)) between 1 and 80),
  telefon text not null default '' check (char_length(telefon) <= 40),
  personen integer not null check (personen between 1 and 500),
  beginn timestamptz not null,
  -- Bis wann der Tisch belegt ist. Bei "offen" bis zum Ende der Öffnungszeit,
  -- solange das Personal den Tisch nicht früher freigibt.
  ende timestamptz not null,
  status public.reservierung_status not null default 'bestaetigt',
  quelle public.reservierung_quelle not null default 'personal',
  anlass text not null default '' check (char_length(anlass) <= 80),
  notiz text not null default '' check (char_length(notiz) <= 500),
  erstellt_von uuid references auth.users (id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  check (ende > beginn),
  -- Kern des Doppelbuchungsschutzes: Zwei aktive Reservierungen am selben
  -- Tisch dürfen sich zeitlich nie überschneiden. Stornierte, beendete und
  -- nicht erschienene zählen nicht mit.
  constraint kein_doppelter_tisch exclude using gist (
    tisch_id with =,
    tstzrange(beginn, ende) with &&
  ) where (status in ('bestaetigt', 'angekommen') and tisch_id is not null)
);
create index reservierungen_tag_idx on public.reservierungen (restaurant_id, beginn);

alter table public.reservierungen enable row level security;
create policy reservierungen_lesen on public.reservierungen
  for select to authenticated using (public.ist_mitglied(restaurant_id));
revoke all on public.reservierungen from anon, authenticated;
grant select on public.reservierungen to authenticated;

-- Liefert den Öffnungszeit-Block, in den ein Zeitpunkt fällt (oder nichts).
-- Berücksichtigt Zeiten über Mitternacht: 00:30 Uhr am Dienstag gehört zum
-- Montagsblock 17:00–01:00.
create function public.oeffnungsblock(p_restaurant uuid, p_datum date, p_uhrzeit time, p_zeitzone text)
returns table (block_beginn timestamptz, block_ende timestamptz)
language sql stable security definer set search_path = '' as $$
  select (p_datum + o.von) at time zone p_zeitzone,
         (case when o.bis > o.von then p_datum + o.bis else p_datum + 1 + o.bis end) at time zone p_zeitzone
  from public.oeffnungszeiten o
  where o.restaurant_id = p_restaurant
    and o.wochentag = extract(isodow from p_datum)
    and p_uhrzeit >= o.von and (o.bis <= o.von or p_uhrzeit < o.bis)
  union all
  select (p_datum - 1 + o.von) at time zone p_zeitzone,
         (p_datum + o.bis) at time zone p_zeitzone
  from public.oeffnungszeiten o
  where o.restaurant_id = p_restaurant
    and o.wochentag = extract(isodow from p_datum - 1)
    and o.bis < o.von and p_uhrzeit < o.bis
  limit 1;
$$;

-- Legt eine Reservierung an. Einziger Weg, um zu buchen.
--   p_tisch:       bestimmter Tisch, oder leer für "automatisch den passenden suchen"
--   p_durchgang:   nur bei festen Durchgängen: welcher Durchgang
--   p_ausserhalb:  true erlaubt dem Personal eine Buchung außerhalb der Öffnungszeiten
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
  p_ausserhalb boolean default false
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
  -- Bei "offen" bleibt der Tisch bis zum Ende der Öffnungszeit belegt,
  -- solange das Personal ihn nicht früher freigibt.
  if r.dauer_modus = 'offen' and v_block_ende is not null and v_block_ende > v_beginn then
    v_ende := v_block_ende;
  end if;

  -- 3a. Restaurant zählt nur Plätze: Es wird immer nur eine Buchung
  --     gleichzeitig geprüft (Sperre), damit zwei gleichzeitige Anfragen
  --     nicht beide den letzten Platz bekommen.
  if r.vergabe_modus = 'plaetze' then
    if r.plaetze_gesamt is null then
      raise exception 'PLAETZE_NICHT_EINGESTELLT';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_restaurant::text, 0));
    -- Höchste gleichzeitige Belegung im gewünschten Zeitraum.
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
      (restaurant_id, gast_name, telefon, personen, beginn, ende, quelle, anlass, notiz, erstellt_von)
      values (p_restaurant, btrim(p_gast_name), btrim(coalesce(p_telefon, '')), p_personen, v_beginn, v_ende,
              p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), auth.uid())
      returning id into v_id;
    return v_id;
  end if;

  -- 3b. Feste Tische, bestimmter Tisch gewünscht.
  if p_tisch is not null then
    if not exists (select 1 from public.tische where id = p_tisch and restaurant_id = p_restaurant) then
      raise exception 'TISCH_UNBEKANNT';
    end if;
    begin
      insert into public.reservierungen
        (restaurant_id, tisch_id, gast_name, telefon, personen, beginn, ende, quelle, anlass, notiz, erstellt_von)
        values (p_restaurant, p_tisch, btrim(p_gast_name), btrim(coalesce(p_telefon, '')), p_personen, v_beginn, v_ende,
                p_quelle, btrim(coalesce(p_anlass, '')), btrim(coalesce(p_notiz, '')), auth.uid())
        returning id into v_id;
    exception when exclusion_violation then
      raise exception 'TISCH_BELEGT';
    end;
    return v_id;
  end if;

  -- 3c. Feste Tische, automatisch: kleinster passender freier Tisch.
  --     Schnappt eine gleichzeitige Buchung den Tisch weg, greift die
  --     Ausschlussregel und es wird der nächste Tisch versucht.
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
        (restaurant_id, tisch_id, gast_name, telefon, personen, beginn, ende, quelle, anlass, notiz, erstellt_von)
        values (p_restaurant, v_tisch.id, btrim(p_gast_name), btrim(coalesce(p_telefon, '')), p_personen, v_beginn, v_ende,
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

-- Ändert den Status einer Reservierung:
--   angekommen        Gäste sitzen
--   abgeschlossen     Gäste sind weg, der Tisch ist ab sofort wieder frei
--   storniert         abgesagt, der Tisch ist wieder frei
--   nicht_erschienen  No-Show, der Tisch ist wieder frei
create function public.reservierung_status_setzen(p_id uuid, p_status public.reservierung_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.reservierungen%rowtype;
begin
  select * into v from public.reservierungen where id = p_id for update;
  if v.id is null or not public.ist_mitglied(v.restaurant_id) then
    raise exception 'RESERVIERUNG_UNBEKANNT';
  end if;
  if not public.darf_reservieren(v.restaurant_id) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  -- Erlaubte Übergänge: Abgeschlossenes bleibt abgeschlossen.
  if v.status not in ('bestaetigt', 'angekommen') or p_status = 'bestaetigt'
     or (v.status = 'angekommen' and p_status in ('angekommen', 'nicht_erschienen')) then
    raise exception 'STATUS_NICHT_MOEGLICH';
  end if;
  update public.reservierungen set
    status = p_status,
    -- Gehen die Gäste früher, endet die Belegung jetzt.
    ende = case when p_status = 'abgeschlossen' and now() > beginn and now() < ende then now() else ende end,
    geaendert_am = now()
  where id = p_id;
end;
$$;

-- Alle Reservierungen eines Tages mit Uhrzeiten in der Zeit des Restaurants.
-- Läuft mit den Rechten des Aufrufers, die Zugriffsregeln gelten also.
create function public.reservierungen_am(p_restaurant uuid, p_datum date)
returns table (
  id uuid, tisch_id uuid, tisch_name text, gast_name text, telefon text, personen integer,
  von text, bis text, von_minuten integer, bis_minuten integer,
  status public.reservierung_status, quelle public.reservierung_quelle, anlass text, notiz text
)
language sql stable set search_path = '' as $$
  select a.id, a.tisch_id, t.name, a.gast_name, a.telefon, a.personen,
    to_char(a.beginn at time zone r.zeitzone, 'HH24:MI'),
    to_char(a.ende at time zone r.zeitzone, 'HH24:MI'),
    (extract(epoch from (a.beginn at time zone r.zeitzone) - p_datum::timestamp) / 60)::integer,
    (extract(epoch from (a.ende at time zone r.zeitzone) - p_datum::timestamp) / 60)::integer,
    a.status, a.quelle, a.anlass, a.notiz
  from public.reservierungen a
  join public.restaurants r on r.id = a.restaurant_id
  left join public.tische t on t.id = a.tisch_id
  where a.restaurant_id = p_restaurant
    and (a.beginn at time zone r.zeitzone)::date = p_datum
  order by a.beginn, t.name;
$$;

revoke execute on function
  public.oeffnungsblock(uuid, date, time, text),
  public.reservierung_anlegen(uuid, date, time, integer, text, text, uuid, uuid, text, text, public.reservierung_quelle, boolean),
  public.reservierung_status_setzen(uuid, public.reservierung_status),
  public.reservierungen_am(uuid, date)
  from public, anon;
grant execute on function
  public.reservierung_anlegen(uuid, date, time, integer, text, text, uuid, uuid, text, text, public.reservierung_quelle, boolean),
  public.reservierung_status_setzen(uuid, public.reservierung_status),
  public.reservierungen_am(uuid, date)
  to authenticated;
