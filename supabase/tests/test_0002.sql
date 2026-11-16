-- Lokaler Test der Einrichtung. Läuft nach test_0001.sql in derselben Datenbank.
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
set role authenticated;

-- Chef (Inhaber)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.oeffnungszeiten_setzen(:'rid', '[{"wochentag":1,"von":"11:30","bis":"14:00"},{"wochentag":1,"von":"17:00","bis":"01:00"}]');
select public.oeffnungszeiten_setzen(:'rid', '[{"wochentag":2,"von":"17:00","bis":"22:00"}]');
select pg_temp.pruefe((select count(*) from public.oeffnungszeiten) = 1, 'Oeffnungszeiten werden ersetzt');
select pg_temp.erwarte_fehler(format($f$select public.oeffnungszeiten_setzen(%L, '[{"wochentag":9,"von":"10:00","bis":"11:00"}]')$f$, :'rid'), 'check');
select pg_temp.pruefe((select count(*) from public.oeffnungszeiten) = 1, 'fehlerhafte Eingabe laesst alte Zeiten stehen');
insert into public.tische (restaurant_id, name, plaetze, bereich) values (:'rid','Tisch 1',4,'Gastraum'), (:'rid','Tisch 2',2,'Terrasse');
select pg_temp.erwarte_fehler(format($f$insert into public.tische (restaurant_id, name, plaetze) values (%L,'Tisch 1',4)$f$, :'rid'), 'duplicate');
select pg_temp.erwarte_fehler(format($f$insert into public.tische (restaurant_id, name, plaetze) values (%L,'Riesig',500)$f$, :'rid'), 'check');
update public.restaurants set dauer_modus = 'durchgaenge', standard_dauer_minuten = 90 where id = :'rid';
select pg_temp.erwarte_fehler(format($f$update public.restaurants set standard_dauer_minuten = 100 where id = %L$f$, :'rid'), 'check');
select pg_temp.erwarte_fehler(format($f$update public.restaurants set name = 'Umbenannt' where id = %L$f$, :'rid'), 'permission denied');
insert into public.durchgaenge (restaurant_id, name, von, bis) values (:'rid','Erster','17:30','19:30');

-- Manager gehoert zur Leitung
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.tische (restaurant_id, name, plaetze) values (:'rid','Tisch 3',6);
update public.restaurants set warteliste_modus = 'automatisch' where id = :'rid';
select pg_temp.pruefe((select warteliste_modus = 'automatisch' from public.restaurants where id = :'rid'), 'Manager aendert Einstellungen');

-- Mitarbeiter: liest, aendert nichts
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.pruefe((select count(*) from public.tische) = 3, 'Mitarbeiter sieht 3 Tische');
select pg_temp.erwarte_fehler(format($f$insert into public.tische (restaurant_id, name, plaetze) values (%L,'Heimlich',4)$f$, :'rid'), 'row-level security');
select pg_temp.pruefe(pg_temp.zeilen('delete from public.tische') = 0, 'Mitarbeiter loescht keine Tische');
select pg_temp.pruefe(pg_temp.zeilen($f$update public.restaurants set dauer_modus = 'offen'$f$) = 0, 'Mitarbeiter aendert keine Einstellungen');
select pg_temp.erwarte_fehler(format($f$select public.oeffnungszeiten_setzen(%L, '[]')$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$insert into public.durchgaenge (restaurant_id, von, bis) values (%L,'12:00','14:00')$f$, :'rid'), 'row-level security');

-- Fremder: sieht und aendert nichts im anderen Restaurant
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.pruefe((select count(*) from public.tische) = 0, 'Fremder sieht keine Tische');
select pg_temp.pruefe((select count(*) from public.oeffnungszeiten) = 0, 'Fremder sieht keine Oeffnungszeiten');
select pg_temp.erwarte_fehler(format($f$insert into public.tische (restaurant_id, name, plaetze) values (%L,'Fremd',4)$f$, :'rid'), 'row-level security');
select pg_temp.pruefe(pg_temp.zeilen(format($f$update public.restaurants set dauer_modus = 'offen' where id = %L$f$, :'rid')) = 0, 'Fremder aendert fremde Einstellungen nicht');
select pg_temp.erwarte_fehler(format($f$select public.oeffnungszeiten_setzen(%L, '[]')$f$, :'rid'), 'KEINE_BERECHTIGUNG');
insert into public.tische (restaurant_id, name, plaetze) values (:'rid2','Tisch 1',4);

reset role; set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler($f$select * from public.tische$f$, 'permission denied');
reset role;
select pg_temp.pruefe((select count(*) from public.tische where restaurant_id = :'rid') = 3, 'am Ende 3 Tische im ersten Restaurant');
select 'ALLE TESTS BESTANDEN' as ergebnis;
