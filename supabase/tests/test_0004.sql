-- Lokaler Test der Gästekartei. Läuft nach test_0001 bis test_0003.
-- 2030-01-08 ist ein Dienstag (geöffnet 11:30–14:00 und 17:00–01:00).
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
create function pg_temp.zeilen(p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n; end $$;

select id as rid from public.restaurants where name = 'Zur Linde' \gset
select id as rid2 from public.restaurants where name = 'Anderes Haus' \gset
select id as t1 from public.tische where restaurant_id = :'rid' and name = 'Tisch 1' \gset
delete from public.reservierungen;
delete from public.gaeste;

select pg_temp.pruefe(public.telefon_normal('0151 234-567') = '+49151234567', 'Telefon 0151 wird +49151');
select pg_temp.pruefe(public.telefon_normal('0049 151 234567') = '+49151234567', 'Telefon 0049 wird +49');
select pg_temp.pruefe(public.telefon_normal('+43 1 234') = '+431234', 'auslaendische Nummer bleibt');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- Buchung legt Karteikarte an, gleiche Nummer findet sie wieder
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 2, 'Frau Lueders', '0151 111 222', :'t1') as r1 \gset
select gast_id as g1 from public.reservierungen where id = :'r1' \gset
select pg_temp.pruefe(:'g1' <> '', 'Buchung legt Karteikarte an');
select public.reservierung_anlegen(:'rid', '2030-01-08', '12:00', 2, 'Lueders, Anna', '+49 151 111222', :'t1') as r2 \gset
select pg_temp.pruefe((select gast_id from public.reservierungen where id = :'r2') = :'g1', 'gleiche Nummer anders geschrieben: dieselbe Karteikarte');
select pg_temp.pruefe((select count(*) from public.gaeste) = 1, 'keine doppelte Karteikarte');
-- Ausdrücklich gewählter Gast: dessen Name gilt
select public.reservierung_anlegen(:'rid', '2030-01-08', '20:30', 2, 'Tippfehler', '', :'t1', p_gast => :'g1') as r3 \gset
select pg_temp.pruefe((select gast_name from public.reservierungen where id = :'r3') = 'Frau Lueders', 'gewaehlter Gast: Name aus der Kartei');
-- Ohne Telefon: neue Karteikarte
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 2, 'Laufkundschaft') as r4 \gset
select pg_temp.pruefe((select count(*) from public.gaeste) = 2, 'ohne Telefon: neue Karteikarte');
select pg_temp.erwarte_fehler(format($f$select public.reservierung_anlegen(%L,'2030-01-08','12:30',2,'X','',null,null,'','','personal',false,(select id from public.gaeste where name='Laufkundschaft' and restaurant_id=%L)::uuid)$f$, :'rid', :'rid2'), 'GAST_UNBEKANNT');

-- Besuche zaehlen nur, wenn die Gaeste wirklich da waren
select public.reservierung_status_setzen(:'r1', 'angekommen');
select public.reservierung_status_setzen(:'r2', 'abgeschlossen');
select public.reservierung_status_setzen(:'r3', 'storniert');
select pg_temp.pruefe((select besuche from public.gaeste_liste(:'rid') where id = :'g1') = 2, 'Besuche: 2 (Storno zaehlt nicht)');
select pg_temp.pruefe((select besuche = 2 from public.reservierungen_am(:'rid','2030-01-08') where id = :'r1'), 'Tagesliste kennt die Besuche');
select pg_temp.pruefe((select count(*) from public.gaeste_liste(:'rid', 'lued')) = 1, 'Suche nach Namensteil');
select pg_temp.pruefe((select count(*) from public.gaeste_liste(:'rid', '111 222')) = 1, 'Suche nach Telefonteil');
select pg_temp.pruefe((select count(*) from public.gaeste_liste(:'rid', '', 'stammgaeste')) = 0, 'noch kein Stammgast');
select pg_temp.pruefe((select count(*) from public.gast_besuche(:'g1')) = 3, 'Besuchsverlauf zeigt alle 3 Reservierungen');

-- Allergien nur mit Einwilligung
select pg_temp.erwarte_fehler(format($f$update public.gaeste set allergien = 'Nuesse' where id = %L$f$, :'g1'), 'check');
update public.gaeste set allergien = 'Nuesse', allergien_einwilligung_am = now(), vorlieben = 'Riesling' where id = :'g1';
select pg_temp.pruefe((select allergien = 'Nuesse' from public.reservierungen_am(:'rid','2030-01-08') where id = :'r1'), 'Allergie erscheint in der Tagesliste');
update public.gaeste set allergien = '' where id = :'g1';
select pg_temp.pruefe((select allergien_einwilligung_am is null from public.gaeste where id = :'g1'), 'Allergie geloescht: Einwilligung verfaellt');
select pg_temp.erwarte_fehler(format($f$update public.gaeste set restaurant_id = %L where id = %L$f$, :'rid2', :'g1'), 'permission denied');
select pg_temp.erwarte_fehler(format($f$insert into public.gaeste (restaurant_id, name, telefon) values (%L, 'Doppelt', '0151111222')$f$, :'rid'), 'duplicate');

-- Hausgast
insert into public.aufenthalte (restaurant_id, gast_id, zimmer, anreise, abreise)
  values (:'rid', :'g1', '12', current_date - 1, current_date + 2);
select pg_temp.pruefe((select ist_hausgast and zimmer = '12' from public.gaeste_liste(:'rid') where id = :'g1'), 'Hausgast mit Zimmer erkannt');
select pg_temp.pruefe((select count(*) from public.gaeste_liste(:'rid', '', 'hausgaeste')) = 1, 'Reiter Hausgaeste');
select pg_temp.erwarte_fehler(format($f$insert into public.aufenthalte (restaurant_id, gast_id, anreise, abreise) values (%L, %L, '2030-01-01', '2030-01-02')$f$, :'rid2', :'g1'), 'row-level security');

-- Azubi ohne Freigabe: liest, aendert nichts
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.pruefe((select count(*) from public.gaeste_liste(:'rid')) = 2, 'Azubi sieht die Kartei');
select pg_temp.pruefe(pg_temp.zeilen(format($f$update public.gaeste set notizen = 'x' where id = %L$f$, :'g1')) = 0, 'Azubi aendert keine Karteikarte');
select pg_temp.erwarte_fehler(format($f$insert into public.gaeste (restaurant_id, name) values (%L, 'Azubi-Gast')$f$, :'rid'), 'row-level security');
-- Mitarbeiter mit Freigabe: pflegt, loescht aber nicht
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.pruefe(pg_temp.zeilen(format($f$update public.gaeste set notizen = 'Mag Fensterplatz' where id = %L$f$, :'g1')) = 1, 'Mitarbeiter pflegt Karteikarte');
select pg_temp.pruefe(pg_temp.zeilen(format($f$delete from public.gaeste where id = %L$f$, :'g1')) = 0, 'Mitarbeiter loescht nicht');
-- Fremder sieht nichts
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.pruefe((select count(*) from public.gaeste) = 0, 'Fremder sieht keine Gaeste');
select pg_temp.pruefe((select count(*) from public.gaeste_liste(:'rid')) = 0, 'Fremder: Liste leer');
select pg_temp.pruefe((select count(*) from public.gast_besuche(:'g1')) = 0, 'Fremder: kein Besuchsverlauf');
reset role; set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler($f$select * from public.gaeste$f$, 'permission denied');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.erwarte_fehler($f$select public.gaeste_aufraeumen()$f$, 'permission denied');
-- Chef loescht Karteikarte: Reservierungen bleiben ohne Verweis
select pg_temp.pruefe(pg_temp.zeilen(format($f$delete from public.gaeste where id = %L$f$, :'g1')) = 1, 'Leitung loescht Karteikarte');
select pg_temp.pruefe((select count(*) from public.reservierungen where gast_id is null) = 3, 'Reservierungen bleiben, Verweis geloescht');
reset role;

-- Loeschfrist (als Systemlauf)
update public.restaurants set loeschfrist_monate = 1 where id = :'rid';
insert into public.gaeste (restaurant_id, name, erstellt_am) values (:'rid', 'Uralt', now() - interval '2 years');
update public.reservierungen set beginn = now() - interval '2 years', ende = now() - interval '2 years' + interval '2 hours' where id = :'r4';
update public.gaeste set erstellt_am = now() - interval '2 years' where name = 'Laufkundschaft';
select public.gaeste_aufraeumen();
select pg_temp.pruefe(not exists (select 1 from public.gaeste where name in ('Uralt', 'Laufkundschaft')), 'alte Karteikarten geloescht');
select pg_temp.pruefe((select gast_name = 'Gelöscht' and gast_id is null from public.reservierungen where id = :'r4'), 'alte Reservierung anonymisiert');
select pg_temp.pruefe((select gast_name = 'Frau Lueders' from public.reservierungen where id = :'r1'), 'kuenftige Reservierung unberuehrt');
update public.restaurants set loeschfrist_monate = 36 where id = :'rid';
delete from public.reservierungen;
delete from public.gaeste;
select 'ALLE TESTS BESTANDEN' as ergebnis;
