-- Lokaler Test von Protokoll, Datenauskunft, Import und Restaurant-Löschung.
-- Läuft nach test_0001 bis test_0006.
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
select id as rid2 from public.restaurants where name = 'Anderes Haus' \gset
select id as t1 from public.tische where restaurant_id = :'rid' and name = 'Tisch 1' \gset
delete from public.protokoll;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- Protokoll: Reservierung, Karteikarte, Statuswechsel, Einstellungen
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 2, 'Frau Lueders', '0151 111', :'t1') as r1 \gset
select gast_id as g1 from public.reservierungen where id = :'r1' \gset
update public.gaeste set allergien = 'Nuesse', allergien_einwilligung_am = now(), notizen = 'Fenster' where id = :'g1';
select public.reservierung_status_setzen(:'r1', 'angekommen');
update public.restaurants set loeschfrist_monate = 24 where id = :'rid';
select pg_temp.pruefe((select count(*) from public.protokoll where aktion = 'reservierung_angelegt' and details like '08.01.2030 18:00, 2 Pers.%') = 1, 'Protokoll: Reservierung angelegt');
select pg_temp.pruefe((select count(*) from public.protokoll where aktion = 'gast_angelegt' and objekt_id = :'g1') = 1, 'Protokoll: Karteikarte angelegt');
select pg_temp.pruefe((select details = 'Notizen, Allergien' and wer = 'Chef' from public.protokoll where aktion = 'gast_geaendert'), 'Protokoll: nur Feldnamen, mit Namen des Bearbeiters');
select pg_temp.pruefe(not exists (select 1 from public.protokoll where details like '%Nuesse%' or details like '%Fenster%'), 'keine Inhalte oder Gesundheitsdaten im Protokoll');
select pg_temp.pruefe((select count(*) from public.protokoll where aktion = 'reservierung_status' and details like '%bestaetigt -> angekommen') = 1, 'Protokoll: Statuswechsel');
select pg_temp.pruefe((select details like '%Löschfrist 24 Monate%' from public.protokoll where aktion = 'einstellungen_geaendert'), 'Protokoll: Einstellungen');
update public.restaurants set loeschfrist_monate = 36 where id = :'rid';
-- Absage per Link wird als Gast protokolliert
select public.reservierung_anlegen(:'rid', '2030-01-08', '20:30', 2, 'Absager', '0151 222', :'t1') as r2 \gset
reset role;
select schluessel as s2 from public.reservierungen where id = :'r2' \gset
set role anon; set request.jwt.claim.sub = '';
select public.reservierung_absagen_per_link(:'s2');
reset role;
select pg_temp.pruefe((select wer = 'Gast oder System' and details like '%vom Gast über den Link%' from public.protokoll where objekt_id = :'r2' and aktion = 'reservierung_status'), 'Protokoll: Absage per Link');

-- Rechte am Protokoll
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.pruefe((select count(*) from public.protokoll) = 0, 'Mitarbeiter sieht kein Protokoll');
select pg_temp.erwarte_fehler(format($f$select public.protokoll_eintragen(%L, 'export')$f$, :'rid'), 'KEINE_BERECHTIGUNG');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.pruefe((select count(*) from public.protokoll) > 5, 'Manager sieht das Protokoll');
select pg_temp.erwarte_fehler($f$insert into public.protokoll (restaurant_id, aktion) select id, 'gefaelscht' from public.restaurants limit 1$f$, 'permission denied');
select pg_temp.erwarte_fehler(format($f$select public.protokoll_eintragen(%L, 'gefaelscht')$f$, :'rid'), 'EINGABE_FEHLT');
select public.protokoll_eintragen(:'rid', 'export', 'Gesamtexport');
select pg_temp.pruefe((select wer = 'Mia' from public.protokoll where aktion = 'export'), 'Export protokolliert');

-- Datenauskunft
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.gast_auskunft(:'g1') as auskunft \gset
select pg_temp.pruefe((:'auskunft'::jsonb #>> '{karteikarte,allergien}') = 'Nuesse', 'Auskunft enthaelt die Karteikarte');
select pg_temp.pruefe(jsonb_array_length(:'auskunft'::jsonb -> 'reservierungen') = 1, 'Auskunft enthaelt die Reservierungen');
select pg_temp.pruefe(jsonb_array_length(:'auskunft'::jsonb -> 'nachrichten') >= 1, 'Auskunft enthaelt die Nachrichten');
select pg_temp.pruefe((select count(*) from public.protokoll where aktion = 'auskunft' and objekt_id = :'g1') = 1, 'Auskunft protokolliert');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.erwarte_fehler(format($f$select public.gast_auskunft(%L)$f$, :'g1'), 'GAST_UNBEKANNT');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.erwarte_fehler(format($f$select public.gast_auskunft(%L)$f$, :'g1'), 'GAST_UNBEKANNT');

-- Import
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.gaeste_importieren(:'rid', '[
  {"name":"Import Eins","telefon":"0160 1","email":"a@b.de","geburtstag":"1980-05-01","notizen":"alt"},
  {"name":"Import Zwei","telefon":"+49 160 1"},
  {"name":"Frau Lueders neu","telefon":"0151111"},
  {"name":"Ohne Nummer"},
  {"name":"ohne nummer"},
  {"name":"","telefon":"0160 9"},
  {"name":"Kaputtes Datum","geburtstag":"2020-13-45"}
]'::jsonb) as ergebnis \gset
select pg_temp.pruefe(:'ergebnis'::jsonb = '{"neu": 3, "doppelt": 3, "fehler": 1}'::jsonb, 'Import: 3 neu, 3 doppelt, 1 ohne Namen');
select pg_temp.pruefe((select geburtstag = '1980-05-01' and email = 'a@b.de' from public.gaeste where name = 'Import Eins'), 'Import uebernimmt die Felder');
select pg_temp.pruefe((select geburtstag is null from public.gaeste where name = 'Kaputtes Datum'), 'kaputtes Datum wird leer');
select pg_temp.pruefe((select count(*) from public.protokoll where aktion = 'import') = 1 and not exists (select 1 from public.protokoll p join public.gaeste g on g.id = p.objekt_id where g.name like 'Import%'), 'Import: eine Zusammenfassung statt einzelner Eintraege');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.erwarte_fehler(format($f$select public.gaeste_importieren(%L, '[]')$f$, :'rid'), 'KEINE_BERECHTIGUNG');

-- Restaurant löschen
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.erwarte_fehler(format($f$select public.restaurant_loeschen(%L, 'Zur Linde')$f$, :'rid'), 'KEINE_BERECHTIGUNG');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.erwarte_fehler(format($f$select public.restaurant_loeschen(%L, 'Zur Lind')$f$, :'rid'), 'NAME_STIMMT_NICHT');
select pg_temp.erwarte_fehler(format($f$select public.restaurant_loeschen(%L, 'Anderes Haus')$f$, :'rid2'), 'KEINE_BERECHTIGUNG');
reset role;

-- Nächtliches Aufräumen schreibt eine Zusammenfassung
update public.restaurants set loeschfrist_monate = 1 where id = :'rid';
insert into public.gaeste (restaurant_id, name, erstellt_am) values (:'rid', 'Uralt', now() - interval '2 years');
delete from public.protokoll where aktion = 'gast_angelegt' and zeit > now() - interval '1 minute' and objekt_id = (select id from public.gaeste where name = 'Uralt');
select public.gaeste_aufraeumen();
select pg_temp.pruefe((select details like '1 Karteikarten gelöscht%' from public.protokoll where aktion = 'loeschfrist'), 'Loeschfrist: Zusammenfassung im Protokoll');
select pg_temp.pruefe(not exists (select 1 from public.protokoll where aktion = 'gast_geloescht' and wer = 'Gast oder System'), 'keine Einzeleintraege vom Systemlauf');
update public.restaurants set loeschfrist_monate = 36 where id = :'rid';

-- Zum Schluss: ein Wegwerf-Restaurant anlegen und löschen
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public.restaurant_anlegen('Wegwerf', 'Fremd') as rw \gset
insert into public.tische (restaurant_id, name, plaetze) values (:'rw', 'T', 4);
select public.restaurant_loeschen(:'rw', ' Wegwerf ');
reset role;
select pg_temp.pruefe(not exists (select 1 from public.restaurants where id = :'rw') and not exists (select 1 from public.tische where restaurant_id = :'rw')
  and not exists (select 1 from public.mitglieder where restaurant_id = :'rw'), 'Restaurant mit allen Daten geloescht');
select pg_temp.pruefe(exists (select 1 from public.restaurants where name = 'Anderes Haus'), 'anderes Restaurant desselben Inhabers bleibt');
delete from public.reservierungen; delete from public.gaeste; delete from public.protokoll;
select 'ALLE TESTS BESTANDEN' as ergebnis;
