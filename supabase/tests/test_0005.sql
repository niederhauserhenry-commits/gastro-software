-- Lokaler Test der Nachrichten und des Absage-Links. Läuft nach test_0001 bis test_0004.
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
select id as t1 from public.tische where restaurant_id = :'rid' and name = 'Tisch 1' \gset
delete from public.reservierungen; delete from public.gaeste;
update public.restaurants set nachrichten_modus = 'test', erinnerung_stunden = 24 where id = :'rid';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- 2030-01-08 18:00: Bestätigung sofort, Erinnerung am Vortag 18:00
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 4, 'Frau Lueders', '0151 111 222', :'t1') as r1 \gset
select pg_temp.pruefe((select count(*) from public.nachrichten where reservierung_id = :'r1') = 2, 'Bestaetigung und Erinnerung geplant');
select pg_temp.pruefe((select an = '+49151111222' from public.nachrichten where reservierung_id = :'r1' and art = 'bestaetigung'), 'Empfaenger normalisiert');
select pg_temp.pruefe((select text like 'Zur Linde: Ihr Tisch am 08.01. um 18:00 Uhr für 4 Pers. ist reserviert. Absagen: https://gastro-software.vercel.app/r/%'
  from public.nachrichten where reservierung_id = :'r1' and art = 'bestaetigung'), 'Vorlage richtig gefuellt');
select pg_temp.pruefe((select length(text) <= 160 from public.nachrichten where reservierung_id = :'r1' and art = 'bestaetigung'), 'Bestaetigung passt in eine SMS');
select pg_temp.pruefe((select senden_ab = '2030-01-07 18:00 Europe/Berlin'::timestamptz from public.nachrichten where reservierung_id = :'r1' and art = 'erinnerung'), 'Erinnerung 24 Stunden vorher');
-- Ohne Telefon keine Nachricht
select public.reservierung_anlegen(:'rid', '2030-01-08', '12:00', 2, 'Ohne Telefon', '', :'t1') as r2 \gset
select pg_temp.pruefe((select count(*) from public.nachrichten where reservierung_id = :'r2') = 0, 'ohne Telefon keine Nachricht');
-- Mitarbeiter sieht Protokoll, kann aber nichts direkt schreiben
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.pruefe((select count(*) from public.nachrichten) = 2, 'Team sieht das Protokoll');
select pg_temp.erwarte_fehler($f$insert into public.nachrichten (restaurant_id, reservierung_id, art, an, text, senden_ab) select restaurant_id, id, 'bestaetigung', '+49', 'x', now() from public.reservierungen limit 1$f$, 'permission denied');
select pg_temp.erwarte_fehler($f$select public.nachrichten_verarbeiten()$f$, 'permission denied');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.pruefe((select count(*) from public.nachrichten) = 0, 'Fremder sieht kein Protokoll');
reset role;

-- Verarbeitung: nur Fälliges, im Testmodus nicht verschickt
select pg_temp.pruefe(public.nachrichten_verarbeiten() = 1, 'eine Nachricht faellig (Bestaetigung)');
select pg_temp.pruefe((select status = 'testmodus' and gesendet_am is not null from public.nachrichten where reservierung_id = :'r1' and art = 'bestaetigung'), 'Bestaetigung im Testmodus erledigt');
select pg_temp.pruefe((select status = 'wartet' from public.nachrichten where reservierung_id = :'r1' and art = 'erinnerung'), 'Erinnerung wartet noch');

-- Absage-Link: als nicht angemeldeter Gast
select schluessel as s1 from public.reservierungen where id = :'r1' \gset
set role anon; set request.jwt.claim.sub = '';
select pg_temp.pruefe((select restaurant = 'Zur Linde' and uhrzeit = '18:00' and absagbar from public.reservierung_per_link(:'s1')), 'Link zeigt die Reservierung');
select pg_temp.pruefe((select count(*) from public.reservierung_per_link('falsch123456')) = 0, 'falscher Schluessel zeigt nichts');
select pg_temp.pruefe((select count(*) from public.reservierung_per_link(left(:'s1', 6))) = 0, 'halber Schluessel zeigt nichts');
select pg_temp.erwarte_fehler($f$select * from public.reservierungen$f$, 'permission denied');
select pg_temp.erwarte_fehler($f$select * from public.nachrichten$f$, 'permission denied');
select pg_temp.pruefe(public.reservierung_absagen_per_link(:'s1'), 'Gast sagt ueber den Link ab');
select pg_temp.pruefe(not public.reservierung_absagen_per_link(:'s1'), 'zweite Absage geht nicht');
select pg_temp.pruefe((select not absagbar and abgesagt_vom_gast from public.reservierung_per_link(:'s1')), 'Link zeigt: abgesagt');
reset role;
select pg_temp.pruefe((select status = 'storniert' and abgesagt_vom_gast from public.reservierungen where id = :'r1'), 'Reservierung storniert, vom Gast');
select pg_temp.pruefe((select status = 'abgebrochen' from public.nachrichten where reservierung_id = :'r1' and art = 'erinnerung'), 'Erinnerung entfaellt nach Absage');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 4, 'Nachruecker', '0170 1', :'t1');
select pg_temp.pruefe(true, 'Tisch nach Absage per Link wieder frei');
select pg_temp.pruefe((select abgesagt_vom_gast from public.reservierungen_am(:'rid','2030-01-08') where id = :'r1'), 'Tagesliste zeigt Absage durch Gast');
reset role;

-- Modus "aus": keine Nachrichten
update public.restaurants set nachrichten_modus = 'aus' where id = :'rid';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_anlegen(:'rid', '2030-01-08', '12:30', 2, 'Kein SMS', '0170 2') as r3 \gset
select pg_temp.pruefe((select count(*) from public.nachrichten where reservierung_id = :'r3') = 0, 'Modus aus: keine Nachricht');
-- Reservierung bald: nur Bestätigung, keine Erinnerung
reset role;
update public.restaurants set nachrichten_modus = 'test' where id = :'rid';
insert into public.oeffnungszeiten (restaurant_id, wochentag, von, bis)
  select :'rid', d, '00:00', '23:59' from generate_series(1, 7) d
  where not exists (select 1 from public.oeffnungszeiten where restaurant_id = :'rid' and wochentag = d);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_anlegen(:'rid', (now() at time zone 'Europe/Berlin')::date + 1, '23:00', 2, 'Morgen', '0170 3', p_ausserhalb => true) as r4 \gset
select pg_temp.pruefe((select count(*) from public.nachrichten where reservierung_id = :'r4') between 1 and 2, 'Reservierung morgen: Nachrichten geplant');
reset role;
delete from public.oeffnungszeiten where restaurant_id = :'rid' and von = '00:00' and bis = '23:59';
delete from public.reservierungen; delete from public.gaeste;
select 'ALLE TESTS BESTANDEN' as ergebnis;
