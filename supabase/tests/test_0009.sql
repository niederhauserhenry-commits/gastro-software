-- Lokaler Test der Telefon-KI-Funktionen.
\set ON_ERROR_STOP 1
create function pg_temp.erwarte_fehler(p_sql text, p_code text) returns text language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FEHLT: % haette % werfen muessen', p_sql, p_code;
exception when others then
  if sqlerrm like '%'||p_code||'%' then return 'ok '||p_code; end if;
  raise;
end $$;
create function pg_temp.pruefe(p_ok boolean, p_text text) returns text language plpgsql as $$
begin if p_ok is not true then raise exception 'FEHLGESCHLAGEN: %', p_text; end if; return 'ok '||p_text; end $$;

select id as rid from public.restaurants where name = 'Zur Linde' \gset
-- Ein Dienstag in gut zwei Wochen, damit er nicht zu weit in der Zukunft liegt.
select current_date + ((9 - extract(isodow from current_date)::int) % 7) + 14 as tag \gset
select (:'tag'::date - 1) as mo \gset
-- Klare Ausgangslage: feste Dauer 2 Stunden, feste Tische, dienstags 17 bis 22 Uhr.
update public.restaurants set vergabe_modus = 'tische', dauer_modus = 'fest', standard_dauer_minuten = 120 where id = :'rid';
delete from public.oeffnungszeiten where restaurant_id = :'rid';
insert into public.oeffnungszeiten (restaurant_id, wochentag, von, bis) values (:'rid', 2, '17:00', '22:00');
delete from public.reservierungen where restaurant_id = :'rid' and (beginn at time zone 'Europe/Berlin')::date = :'tag';

-- Nur die Leitung richtet ein
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.erwarte_fehler(format('select public.telefon_einstellungen_speichern(%L, true, '''', 8)', :'rid'), 'KEINE_BERECHTIGUNG');
select pg_temp.pruefe((select count(*) from public.telefon_zugang) = 0, 'Mitarbeiter sieht keinen Schlüssel');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.telefon_einstellungen_speichern(:'rid', false, 'Parkplätze hinter dem Haus.', 6);
select schluessel as k from public.telefon_zugang where restaurant_id = :'rid' \gset
select pg_temp.pruefe(char_length(:'k') = 36, 'Schlüssel mit 36 Zeichen');

-- Ausgeschaltet: nichts geht
set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler(format('select public.telefon_info(%L)', :'k'), 'TELEFON_NICHT_AKTIV');
select pg_temp.erwarte_fehler('select * from public.telefon_zugang', 'permission denied');
select pg_temp.erwarte_fehler(format('select * from public.telefon_freie_zeiten(%L, ':'tag'', 2)', :'rid'), 'permission denied');

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.telefon_einstellungen_speichern(:'rid', true, 'Parkplätze hinter dem Haus.', 6);
select pg_temp.pruefe((select count(*) from public.protokoll where details like '%Telefon-KI an%') = 1, 'Einschalten steht im Protokoll');

set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler('select public.telefon_info(''falsch'')', 'TELEFON_NICHT_AKTIV');
select pg_temp.pruefe((select public.telefon_info(:'k') ->> 'restaurant') = 'Zur Linde', 'Info mit Restaurantname');
select pg_temp.pruefe((select public.telefon_info(:'k') -> 'oeffnungszeiten' -> 1 ->> 'zeiten') = '17:00 bis 22:00', 'Öffnungszeiten am Dienstag');
select pg_temp.pruefe((select public.telefon_info(:'k') -> 'oeffnungszeiten' -> 0 ->> 'zeiten') = 'geschlossen', 'Montag geschlossen');

-- Anfragen
select pg_temp.pruefe(public.telefon_anfrage(:'k', :'tag', '19:00', 2) ->> 'ergebnis' = 'frei', 'Wunschzeit frei');
select pg_temp.pruefe(public.telefon_anfrage(:'k', :'tag', '19:05', 2) ->> 'uhrzeit' = '19:15', 'auf Viertelstunde gerundet');
select pg_temp.pruefe(public.telefon_anfrage(:'k', :'mo', '19:00', 2) ->> 'ergebnis' = 'geschlossen', 'Ruhetag erkannt');
select pg_temp.pruefe(public.telefon_anfrage(:'k', '2020-01-14', '19:00', 2) ->> 'ergebnis' = 'datum_vergangen', 'Vergangenheit');
select pg_temp.pruefe(public.telefon_anfrage(:'k', :'tag', '19:00', 7) ->> 'ergebnis' = 'gruppe_zu_gross', 'Gruppe über Telefon-Grenze');
select pg_temp.pruefe((public.telefon_anfrage(:'k', :'tag', null, 2) -> 'zeiten' ->> 0) = '17:00', 'freie Zeiten ab Öffnung');
select pg_temp.pruefe((public.telefon_anfrage(:'k', :'tag', null, 2) -> 'zeiten' ->> -1) = '21:30', 'letzte Zeit eine halbe Stunde vor Schluss');

-- Buchen bis voll
select pg_temp.pruefe(public.telefon_buchen(:'k', :'tag', '19:00', 2, 'X', '0151 9') ->> 'ergebnis' = 'name_fehlt', 'Name nötig');
select pg_temp.pruefe(public.telefon_buchen(:'k', :'tag', '19:00', 2, 'Frau Klein', '') ->> 'ergebnis' = 'telefon_fehlt', 'Telefon nötig');
select public.telefon_buchen(:'k', :'tag', '19:00', 2, 'Frau Klein', '+49 151 7777') as b1 \gset
select pg_temp.pruefe((:'b1')::jsonb ->> 'ergebnis' = 'gebucht' and (:'b1')::jsonb ->> 'uhrzeit' = '19:00', 'gebucht');
reset role;
select pg_temp.pruefe((select quelle = 'telefon_ki' and gast_id is not null and tisch_id is not null from public.reservierungen where gast_name = 'Frau Klein'), 'Quelle Telefon-KI, Tisch und Karteikarte');
select count(*) as tische from public.tische where restaurant_id = :'rid' and plaetze >= 2 \gset
set role anon; set request.jwt.claim.sub = '';
-- Restliche Tische um 19 Uhr belegen
select public.telefon_buchen(:'k', :'tag', '19:00', 2, 'Gast ' || g, '0151 100' || g) from generate_series(2, :tische) g;
select pg_temp.pruefe(public.telefon_anfrage(:'k', :'tag', '19:00', 2) ->> 'ergebnis' = 'wunschzeit_belegt', 'voll um 19 Uhr');
select pg_temp.pruefe((public.telefon_anfrage(:'k', :'tag', '19:00', 2) -> 'alternativen' ->> 0) in ('17:00', '21:00'), 'Alternative mit genug Abstand');
select pg_temp.pruefe(public.telefon_buchen(:'k', :'tag', '19:00', 2, 'Zu spät', '0151 555') ->> 'ergebnis' = 'wunschzeit_belegt', 'keine Doppelbuchung');
reset role;
select pg_temp.pruefe((select count(*) from public.reservierungen where restaurant_id = :'rid' and (beginn at time zone 'Europe/Berlin')::date = :'tag') = :tische, 'genau so viele Buchungen wie Tische');

-- Neuer Schlüssel macht den alten ungültig
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.telefon_schluessel_erneuern(:'rid');
set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler(format('select public.telefon_info(%L)', :'k'), 'TELEFON_NICHT_AKTIV');

-- Begrenzung: 30 Telefonbuchungen pro Stunde
reset role;
select schluessel as k2 from public.telefon_zugang where restaurant_id = :'rid' \gset
update public.reservierungen set erstellt_am = now() where quelle = 'telefon_ki';
insert into public.reservierungen (restaurant_id, gast_name, telefon, personen, beginn, ende, quelle, status)
  select :'rid', 'Last ' || g, '', 1, '2031-01-01 12:00+00'::timestamptz + make_interval(days => g), '2031-01-01 13:00+00'::timestamptz + make_interval(days => g), 'telefon_ki', 'storniert'
  from generate_series(1, 30) g;
set role anon;
select pg_temp.pruefe(public.telefon_buchen(:'k2', :'tag', '17:00', 2, 'Viele', '0151 999') ->> 'ergebnis' = 'zu_viele_buchungen', 'Begrenzung pro Stunde');
select 'ALLE TESTS BESTANDEN';
