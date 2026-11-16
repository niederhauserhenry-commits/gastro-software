-- Lokaler Test der Reservierungen. Läuft nach test_0001.sql und test_0002.sql.
-- 2030-01-08 ist ein Dienstag, 2030-01-09 ein Mittwoch.
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
-- Ausgangslage herstellen (als Verwalter): feste Dauer 2 Stunden,
-- Di 11:30–14:00 und 17:00–01:00, Mi geschlossen.
update public.restaurants set vergabe_modus='tische', dauer_modus='fest', standard_dauer_minuten=120 where id = :'rid';
delete from public.oeffnungszeiten where restaurant_id = :'rid';
insert into public.oeffnungszeiten (restaurant_id, wochentag, von, bis) values
  (:'rid', 2, '11:30', '14:00'), (:'rid', 2, '17:00', '01:00');
select id as t1 from public.tische where restaurant_id = :'rid' and name = 'Tisch 1' \gset
select id as t2 from public.tische where restaurant_id = :'rid' and name = 'Tisch 2' \gset
select id as t3 from public.tische where restaurant_id = :'rid' and name = 'Tisch 3' \gset
set role authenticated;

-- Chef bucht ------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 4, 'Familie Meyer', '0151 1', :'t1') as a1 \gset
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','18:00',2,'Doppelt','',%L)$f$, :'rid', :'t1'), 'TISCH_BELEGT');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','19:45',2,'Ueberlappt','',%L)$f$, :'rid', :'t1'), 'TISCH_BELEGT');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','17:00',2,'Davor ueberlappt','',%L)$f$, :'rid', :'t1'), 'TISCH_BELEGT');
select public.reservierung_anlegen(:'rid', '2030-01-08', '20:00', 2, 'Direkt danach', '', :'t1') as a2 \gset
select pg_temp.pruefe(true, 'direkt anschliessende Buchung am selben Tisch geht');

-- Automatische Tischwahl: kleinster passender freier Tisch
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 2, 'Zwei Personen') as a3 \gset
select pg_temp.pruefe((select tisch_id = :'t2' from public.reservierungen where id = :'a3'), 'automatisch: 2 Personen bekommen den Zweiertisch');
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 3, 'Drei Personen') as a4 \gset
select pg_temp.pruefe((select tisch_id = :'t3' from public.reservierungen where id = :'a4'), 'automatisch: Vierertisch belegt, also Sechsertisch');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','18:30',2,'Alles voll')$f$, :'rid'), 'KEIN_TISCH_FREI');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','12:00',8,'Zu gross')$f$, :'rid'), 'KEIN_TISCH_FREI');

-- Eingaben und Oeffnungszeiten
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','18:10',2,'Krumme Zeit')$f$, :'rid'), 'ZEIT_RASTER');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2020-01-07','18:00',2,'Gestern')$f$, :'rid'), 'DATUM_VERGANGEN');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','15:00',2,'Nachmittagspause')$f$, :'rid'), 'AUSSERHALB_OEFFNUNGSZEIT');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-09','18:00',2,'Ruhetag')$f$, :'rid'), 'AUSSERHALB_OEFFNUNGSZEIT');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-09','18:00',2,'KI am Ruhetag', p_quelle => 'telefon_ki', p_ausserhalb => true)$f$, :'rid'), 'AUSSERHALB_OEFFNUNGSZEIT');
select public.reservierung_anlegen(:'rid', '2030-01-09', '18:00', 2, 'Geschlossene Gesellschaft', p_ausserhalb => true) as a5 \gset
select public.reservierung_anlegen(:'rid', '2030-01-09', '00:30', 2, 'Nach Mitternacht') as a6 \gset
select pg_temp.pruefe(true, '00:30 am Mittwoch gehoert zum Dienstagsblock bis 01:00');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-09','01:00',2,'Nach Schluss')$f$, :'rid'), 'AUSSERHALB_OEFFNUNGSZEIT');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','12:00',2,'Fremder Tisch','',(select id from public.tische where restaurant_id = %L limit 1))$f$, :'rid', :'rid2'), 'TISCH_UNBEKANNT');
select pg_temp.erwarte_fehler(format($f$insert into public.reservierungen (restaurant_id, gast_name, personen, beginn, ende) values (%L,'Direkt',2,now(),now()+interval '1 hour')$f$, :'rid'), 'permission denied');

-- Storno gibt den Tisch frei, Tagesliste stimmt
select public.reservierung_status_setzen(:'a1', 'storniert');
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 4, 'Nachruecker', '', :'t1') as a7 \gset
select pg_temp.pruefe(true, 'nach Storno ist der Tisch wieder buchbar');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_status_setzen(%L,'angekommen')$f$, :'a1'), 'STATUS_NICHT_MOEGLICH');
select pg_temp.pruefe((select count(*) from public.reservierungen_am(:'rid', '2030-01-08')) = 5, 'Tagesliste Dienstag: 5 Eintraege');
select pg_temp.pruefe((select von = '18:00' and bis = '20:00' and von_minuten = 1080 and tisch_name = 'Tisch 1'
  from public.reservierungen_am(:'rid', '2030-01-08') where id = :'a7'), 'Uhrzeiten in Ortszeit');

-- Azubi ohne Freigabe: sieht alles, bucht nichts
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.pruefe((select count(*) from public.reservierungen_am(:'rid', '2030-01-08')) = 5, 'Azubi sieht die Tagesliste');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','12:00',2,'Azubi bucht')$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_status_setzen(%L,'storniert')$f$, :'a7'), 'KEINE_BERECHTIGUNG');
-- Mitarbeiter mit Freigabe bucht
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select public.reservierung_anlegen(:'rid', '2030-01-08', '12:00', 2, 'Mittagstisch') as a8 \gset
-- Fremder: sieht und aendert nichts
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.pruefe((select count(*) from public.reservierungen) = 0, 'Fremder sieht keine Reservierungen');
select pg_temp.pruefe((select count(*) from public.reservierungen_am(:'rid', '2030-01-08')) = 0, 'Fremder: Tagesliste leer');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','12:00',2,'Fremder bucht')$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_status_setzen(%L,'storniert')$f$, :'a7'), 'RESERVIERUNG_UNBEKANNT');
reset role; set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','12:00',2,'Anonym')$f$, :'rid'), 'permission denied');
reset role;

-- Tischdauer "offen": Tisch bleibt bis Ende der Oeffnungszeit belegt -----------
update public.restaurants set dauer_modus='offen' where id = :'rid';
delete from public.reservierungen where restaurant_id = :'rid';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_anlegen(:'rid', '2030-01-08', '17:30', 2, 'Offen frueh', '', :'t1') as o1 \gset
select pg_temp.pruefe((select bis = '01:00' from public.reservierungen_am(:'rid', '2030-01-08') where id = :'o1'), 'offen: belegt bis Betriebsschluss');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','21:00',2,'Spaeter am selben Tisch','',%L)$f$, :'rid', :'t1'), 'TISCH_BELEGT');
select public.reservierung_anlegen(:'rid', '2030-01-08', '12:00', 2, 'Mittag selber Tisch', '', :'t1') as o2 \gset
select pg_temp.pruefe(true, 'offen: Mittag und Abend sind getrennte Bloecke');
select public.reservierung_status_setzen(:'o1', 'angekommen');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_status_setzen(%L,'nicht_erschienen')$f$, :'o1'), 'STATUS_NICHT_MOEGLICH');
select public.reservierung_status_setzen(:'o1', 'abgeschlossen');
select public.reservierung_anlegen(:'rid', '2030-01-08', '21:00', 2, 'Nach Freigabe', '', :'t1') as o3 \gset
select pg_temp.pruefe(true, 'offen: nach Freigabe wieder buchbar');
reset role;

-- Feste Durchgaenge -------------------------------------------------------------
update public.restaurants set dauer_modus='durchgaenge' where id = :'rid';
delete from public.reservierungen where restaurant_id = :'rid';
delete from public.durchgaenge where restaurant_id = :'rid';
insert into public.durchgaenge (restaurant_id, name, von, bis) values (:'rid','Frueh','17:30','19:30') returning id as d1 \gset
insert into public.durchgaenge (restaurant_id, name, von, bis) values (:'rid','Spaet','19:45','22:00') returning id as d2 \gset
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','18:00',2,'Ohne Durchgang')$f$, :'rid'), 'DURCHGANG_FEHLT');
select public.reservierung_anlegen(:'rid', '2030-01-08', null, 2, 'Frueher Durchgang', '', :'t1', :'d1') as g1 \gset
select public.reservierung_anlegen(:'rid', '2030-01-08', null, 2, 'Spaeter Durchgang', '', :'t1', :'d2') as g2 \gset
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08',null,2,'Durchgang voll','',%L,%L)$f$, :'rid', :'t1', :'d1'), 'TISCH_BELEGT');
select pg_temp.pruefe((select von = '17:30' and bis = '19:30' from public.reservierungen_am(:'rid', '2030-01-08') where id = :'g1'), 'Durchgang bestimmt Beginn und Ende');
reset role;

-- Nur Plaetze zaehlen: 10 Plaetze ---------------------------------------------
update public.restaurants set vergabe_modus='plaetze', plaetze_gesamt=10, dauer_modus='fest' where id = :'rid';
delete from public.reservierungen where restaurant_id = :'rid';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 6, 'Sechs um 18');
select public.reservierung_anlegen(:'rid', '2030-01-08', '19:00', 4, 'Vier um 19');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','19:30',1,'Einer zu viel')$f$, :'rid'), 'KEIN_PLATZ_FREI');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','17:30',5,'Ueberlappt 18 Uhr')$f$, :'rid'), 'KEIN_PLATZ_FREI');
select public.reservierung_anlegen(:'rid', '2030-01-08', '20:00', 6, 'Sechs um 20, die ersten sind weg');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','20:00',1,'Wieder voll')$f$, :'rid'), 'KEIN_PLATZ_FREI');
select public.reservierung_anlegen(:'rid', '2030-01-08', '17:00', 4, 'Vier um 17, nur mit den Sechs zusammen');
reset role;

-- Zustand fuer den Gleichzeitigkeitstest: feste Tische, alles leer
update public.restaurants set vergabe_modus='tische', dauer_modus='fest' where id = :'rid';
delete from public.reservierungen where restaurant_id = :'rid';
select 'ALLE TESTS BESTANDEN' as ergebnis;
