-- Schritt 7: Nachrichten an Gäste (Bestätigung, Erinnerung, Absage-Link)
--
-- Jede Reservierung mit Telefonnummer bekommt automatisch eine Bestätigung
-- und, rechtzeitig vorher, eine Erinnerung. Beide enthalten einen Link, über
-- den der Gast selbst absagen kann. Das senkt No-Shows und gibt den Tisch frei.
--
-- Solange kein SMS-Anbieter angebunden ist, läuft alles im Testmodus:
-- Die Nachrichten werden erzeugt und im Protokoll angezeigt, aber nicht verschickt.

create type public.nachrichten_modus as enum ('aus', 'test');
create type public.nachricht_art as enum ('bestaetigung', 'erinnerung');
create type public.nachricht_status as enum ('wartet', 'gesendet', 'testmodus', 'abgebrochen', 'fehler');

-- Systemweite Werte, zum Beispiel die Adresse der Webseite für Links in SMS.
create table public.app_konfiguration (
  schluessel text primary key,
  wert text not null
);
insert into public.app_konfiguration (schluessel, wert) values ('app_url', 'https://gastro-software.vercel.app');
alter table public.app_konfiguration enable row level security;
revoke all on public.app_konfiguration from anon, authenticated;

alter table public.restaurants
  add column nachrichten_modus public.nachrichten_modus not null default 'test',
  add column erinnerung_stunden integer not null default 24 check (erinnerung_stunden between 1 and 72),
  add column vorlage_bestaetigung text not null
    default '{restaurant}: Ihr Tisch am {datum} um {uhrzeit} Uhr für {personen} Pers. ist reserviert. Absagen: {link}'
    check (char_length(vorlage_bestaetigung) between 10 and 300),
  add column vorlage_erinnerung text not null
    default '{restaurant}: Wir erwarten Sie am {datum} um {uhrzeit} Uhr. Verhindert? Hier absagen: {link}'
    check (char_length(vorlage_erinnerung) between 10 and 300);
grant update (nachrichten_modus, erinnerung_stunden, vorlage_bestaetigung, vorlage_erinnerung)
  on public.restaurants to authenticated;

-- Jede Reservierung bekommt einen kurzen, nicht erratbaren Schlüssel für den Absage-Link.
alter table public.reservierungen
  add column schluessel text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  add column abgesagt_vom_gast boolean not null default false;
create unique index reservierungen_schluessel_idx on public.reservierungen (schluessel);

create table public.nachrichten (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  reservierung_id uuid not null references public.reservierungen (id) on delete cascade,
  art public.nachricht_art not null,
  an text not null,
  text text not null,
  senden_ab timestamptz not null,
  status public.nachricht_status not null default 'wartet',
  gesendet_am timestamptz,
  fehler text not null default '',
  erstellt_am timestamptz not null default now()
);
create index nachrichten_faellig_idx on public.nachrichten (senden_ab) where status = 'wartet';
create index nachrichten_restaurant_idx on public.nachrichten (restaurant_id, erstellt_am desc);
create index nachrichten_reservierung_idx on public.nachrichten (reservierung_id);

alter table public.nachrichten enable row level security;
create policy nachrichten_lesen on public.nachrichten
  for select to authenticated using (public.ist_mitglied(restaurant_id));
revoke all on public.nachrichten from anon, authenticated;
grant select on public.nachrichten to authenticated;

-- Setzt Name, Datum, Uhrzeit und Link in eine Vorlage ein.
create function public.nachricht_fuellen(p_vorlage text, p_reservierung uuid) returns text
language sql stable security definer set search_path = '' as $$
  select replace(replace(replace(replace(replace(replace(p_vorlage,
    '{restaurant}', r.name),
    '{name}', a.gast_name),
    '{datum}', to_char(a.beginn at time zone r.zeitzone, 'DD.MM.')),
    '{uhrzeit}', to_char(a.beginn at time zone r.zeitzone, 'HH24:MI')),
    '{personen}', a.personen::text),
    '{link}', (select wert from public.app_konfiguration where schluessel = 'app_url') || '/r/' || a.schluessel)
  from public.reservierungen a
  join public.restaurants r on r.id = a.restaurant_id
  where a.id = p_reservierung;
$$;

-- Neue Reservierung: Bestätigung sofort, Erinnerung rechtzeitig vorher.
create function public.nachrichten_einplanen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.restaurants%rowtype;
  v_erinnerung timestamptz;
begin
  select * into r from public.restaurants where id = new.restaurant_id;
  if r.nachrichten_modus = 'aus' or public.telefon_normal(new.telefon) = '' then
    return new;
  end if;
  insert into public.nachrichten (restaurant_id, reservierung_id, art, an, text, senden_ab)
    values (new.restaurant_id, new.id, 'bestaetigung', public.telefon_normal(new.telefon),
            public.nachricht_fuellen(r.vorlage_bestaetigung, new.id), now());
  v_erinnerung := new.beginn - make_interval(hours => r.erinnerung_stunden);
  -- Eine Erinnerung lohnt sich nur, wenn sie deutlich nach der Bestätigung kommt.
  if v_erinnerung > now() + interval '2 hours' then
    insert into public.nachrichten (restaurant_id, reservierung_id, art, an, text, senden_ab)
      values (new.restaurant_id, new.id, 'erinnerung', public.telefon_normal(new.telefon),
              public.nachricht_fuellen(r.vorlage_erinnerung, new.id), v_erinnerung);
  end if;
  return new;
end;
$$;
create trigger nachrichten_einplanen after insert on public.reservierungen
  for each row execute function public.nachrichten_einplanen();

-- Storno, No-Show oder Gäste schon da: noch nicht verschickte Nachrichten entfallen.
create function public.nachrichten_abbrechen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'bestaetigt' and old.status = 'bestaetigt' then
    update public.nachrichten set status = 'abgebrochen'
      where reservierung_id = new.id and status = 'wartet';
  end if;
  return new;
end;
$$;
create trigger nachrichten_abbrechen after update of status on public.reservierungen
  for each row execute function public.nachrichten_abbrechen();

-- Läuft jede Minute und erledigt fällige Nachrichten. Ohne angebundenen
-- SMS-Anbieter werden sie als "testmodus" markiert statt verschickt.
create function public.nachrichten_verarbeiten() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_anzahl integer;
begin
  update public.nachrichten n set status = 'testmodus', gesendet_am = now()
    where n.status = 'wartet' and n.senden_ab <= now();
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- Öffentlicher Absage-Link --------------------------------------------------
-- Diese beiden Funktionen darf jeder aufrufen, der den Schlüssel kennt.
-- Sie geben nur das Nötigste preis.
create function public.reservierung_per_link(p_schluessel text)
returns table (
  restaurant text, gast_name text, datum date, uhrzeit text, personen integer,
  status public.reservierung_status, abgesagt_vom_gast boolean, absagbar boolean
)
language sql stable security definer set search_path = '' as $$
  select r.name, a.gast_name, (a.beginn at time zone r.zeitzone)::date,
    to_char(a.beginn at time zone r.zeitzone, 'HH24:MI'), a.personen, a.status, a.abgesagt_vom_gast,
    a.status = 'bestaetigt' and a.beginn > now()
  from public.reservierungen a
  join public.restaurants r on r.id = a.restaurant_id
  where a.schluessel = p_schluessel and length(p_schluessel) = 12 and a.gast_name <> 'Gelöscht';
$$;

create function public.reservierung_absagen_per_link(p_schluessel text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.reservierungen
    where schluessel = p_schluessel and length(p_schluessel) = 12
      and status = 'bestaetigt' and beginn > now()
    for update;
  if v_id is null then
    return false;
  end if;
  update public.reservierungen
    set status = 'storniert', abgesagt_vom_gast = true, geaendert_am = now()
    where id = v_id;
  return true;
end;
$$;

-- reservierungen_am liefert zusätzlich, ob der Gast selbst abgesagt hat.
drop function public.reservierungen_am(uuid, date);
create function public.reservierungen_am(p_restaurant uuid, p_datum date)
returns table (
  id uuid, tisch_id uuid, tisch_name text, gast_name text, telefon text, personen integer,
  von text, bis text, von_minuten integer, bis_minuten integer,
  status public.reservierung_status, quelle public.reservierung_quelle, anlass text, notiz text,
  gast_id uuid, besuche integer, allergien text, zimmer text, abgesagt_vom_gast boolean
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
      order by f.anreise desc limit 1), ''),
    a.abgesagt_vom_gast
  from public.reservierungen a
  join public.restaurants r on r.id = a.restaurant_id
  left join public.tische t on t.id = a.tisch_id
  left join public.gaeste g on g.id = a.gast_id
  where a.restaurant_id = p_restaurant
    and (a.beginn at time zone r.zeitzone)::date = p_datum
  order by a.beginn, t.name;
$$;

revoke execute on function
  public.nachricht_fuellen(text, uuid),
  public.nachrichten_einplanen(),
  public.nachrichten_abbrechen(),
  public.nachrichten_verarbeiten(),
  public.reservierung_per_link(text),
  public.reservierung_absagen_per_link(text),
  public.reservierungen_am(uuid, date)
  from public, anon, authenticated;
grant execute on function public.reservierungen_am(uuid, date) to authenticated;
grant execute on function public.reservierung_per_link(text), public.reservierung_absagen_per_link(text) to anon, authenticated;

-- Jede Minute fällige Nachrichten erledigen, sofern pg_cron verfügbar ist.
do $$
begin
  perform cron.schedule('nachrichten-verarbeiten', '* * * * *', 'select public.nachrichten_verarbeiten()');
exception when others then
  raise notice 'pg_cron nicht verfügbar: %', sqlerrm;
end;
$$;
