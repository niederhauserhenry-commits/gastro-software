-- Schritt 3: Einrichtung des Restaurants
-- Öffnungszeiten, Tische, Tischvergabe, Tischdauer, Warteliste, Löschfrist.

create type public.vergabe_modus as enum ('tische', 'plaetze');
create type public.dauer_modus as enum ('fest', 'offen', 'durchgaenge');
create type public.warteliste_modus as enum ('automatisch', 'manuell');

alter table public.restaurants
  -- Feste Tische oder nur eine Gesamtzahl an Plätzen.
  add column vergabe_modus public.vergabe_modus not null default 'tische',
  add column plaetze_gesamt integer check (plaetze_gesamt between 1 and 2000),
  -- Wie lange ein Tisch belegt ist: feste Dauer, offen bis zur Freigabe
  -- durch das Personal, oder feste Durchgänge.
  add column dauer_modus public.dauer_modus not null default 'fest',
  add column standard_dauer_minuten integer not null default 120
    check (standard_dauer_minuten between 30 and 480 and standard_dauer_minuten % 15 = 0),
  add column warteliste_modus public.warteliste_modus not null default 'manuell',
  add column warteliste_frist_minuten integer not null default 15
    check (warteliste_frist_minuten between 5 and 120),
  -- Gästedaten werden so viele Monate nach dem letzten Besuch gelöscht.
  add column loeschfrist_monate integer not null default 36
    check (loeschfrist_monate between 1 and 120),
  add column zeitzone text not null default 'Europe/Berlin',
  add column einrichtung_abgeschlossen boolean not null default false;

-- Wochentag: 1 = Montag … 7 = Sonntag.
-- Liegt "bis" vor "von", läuft die Zeit über Mitternacht (z. B. 17:00–01:00).
create table public.oeffnungszeiten (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  wochentag smallint not null check (wochentag between 1 and 7),
  von time not null,
  bis time not null,
  check (von <> bis)
);
create index oeffnungszeiten_restaurant_idx on public.oeffnungszeiten (restaurant_id, wochentag);

create table public.tische (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  bereich text not null default '' check (char_length(bereich) <= 40),
  plaetze integer not null check (plaetze between 1 and 99),
  erstellt_am timestamptz not null default now(),
  unique (restaurant_id, name)
);

-- Feste Durchgänge. Wochentag leer = gilt an jedem Tag.
create table public.durchgaenge (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  wochentag smallint check (wochentag between 1 and 7),
  name text not null default '' check (char_length(name) <= 40),
  von time not null,
  bis time not null,
  check (von <> bis)
);
create index durchgaenge_restaurant_idx on public.durchgaenge (restaurant_id);

-- Zugriffsregeln: Das ganze Team liest, nur die Leitung ändert.
alter table public.oeffnungszeiten enable row level security;
alter table public.tische enable row level security;
alter table public.durchgaenge enable row level security;

create policy oeffnungszeiten_lesen on public.oeffnungszeiten
  for select to authenticated using (public.ist_mitglied(restaurant_id));

create policy tische_lesen on public.tische
  for select to authenticated using (public.ist_mitglied(restaurant_id));
create policy tische_anlegen on public.tische
  for insert to authenticated with check (public.ist_leitung(restaurant_id));
create policy tische_aendern on public.tische
  for update to authenticated using (public.ist_leitung(restaurant_id))
  with check (public.ist_leitung(restaurant_id));
create policy tische_loeschen on public.tische
  for delete to authenticated using (public.ist_leitung(restaurant_id));

create policy durchgaenge_lesen on public.durchgaenge
  for select to authenticated using (public.ist_mitglied(restaurant_id));
create policy durchgaenge_anlegen on public.durchgaenge
  for insert to authenticated with check (public.ist_leitung(restaurant_id));
create policy durchgaenge_loeschen on public.durchgaenge
  for delete to authenticated using (public.ist_leitung(restaurant_id));

-- Die Leitung darf die Einstellungen ihres Restaurants ändern,
-- aber nur diese Spalten.
create policy restaurants_einstellungen on public.restaurants
  for update to authenticated using (public.ist_leitung(id))
  with check (public.ist_leitung(id));

revoke all on public.oeffnungszeiten, public.tische, public.durchgaenge from anon, authenticated;
grant select on public.oeffnungszeiten to authenticated;
grant select, insert, update, delete on public.tische to authenticated;
grant select, insert, delete on public.durchgaenge to authenticated;
grant update (
  vergabe_modus, plaetze_gesamt, dauer_modus, standard_dauer_minuten,
  warteliste_modus, warteliste_frist_minuten, loeschfrist_monate, einrichtung_abgeschlossen
) on public.restaurants to authenticated;

-- Ersetzt alle Öffnungszeiten eines Restaurants in einem Schritt.
-- p_zeiten: [{"wochentag": 1, "von": "11:30", "bis": "14:00"}, …]
create function public.oeffnungszeiten_setzen(p_restaurant uuid, p_zeiten jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ist_leitung(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  delete from public.oeffnungszeiten where restaurant_id = p_restaurant;
  insert into public.oeffnungszeiten (restaurant_id, wochentag, von, bis)
    select p_restaurant, z.wochentag, z.von, z.bis
    from jsonb_to_recordset(coalesce(p_zeiten, '[]'::jsonb)) as z(wochentag smallint, von time, bis time);
end;
$$;

revoke execute on function public.oeffnungszeiten_setzen(uuid, jsonb) from public, anon;
grant execute on function public.oeffnungszeiten_setzen(uuid, jsonb) to authenticated;
