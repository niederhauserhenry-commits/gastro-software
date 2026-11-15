-- Lokaler Test der Rollen und Zugriffsregeln.
\set ON_ERROR_STOP 1
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-000000000001','chef@test.de'),
 ('00000000-0000-0000-0000-000000000002','manager@test.de'),
 ('00000000-0000-0000-0000-000000000003','service@test.de'),
 ('00000000-0000-0000-0000-000000000004','azubi@test.de'),
 ('00000000-0000-0000-0000-000000000005','fremd@test.de');

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

set role authenticated;
-- Chef legt Restaurant an
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.restaurant_anlegen('Zur Linde','Chef') as rid \gset
select pg_temp.pruefe(public.meine_rolle(:'rid') = 'inhaber', 'Anleger ist Inhaber');
select pg_temp.pruefe((select count(*) from public.module_freischaltungen) = 4, 'vier Module');
select public.mitglied_hinzufuegen(:'rid','Manager@Test.de','Mia','manager',true);
select public.mitglied_hinzufuegen(:'rid','service@test.de','Sven','mitarbeiter',false);
select pg_temp.erwarte_fehler(format($f$select public.mitglied_hinzufuegen(%L,'niemand@test.de','X','azubi',false)$f$, :'rid'), 'NUTZER_NICHT_GEFUNDEN');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_hinzufuegen(%L,'service@test.de','X','azubi',false)$f$, :'rid'), 'SCHON_IM_TEAM');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_aendern(%L,'00000000-0000-0000-0000-000000000001','manager',true)$f$, :'rid'), 'LETZTER_INHABER');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_entfernen(%L,'00000000-0000-0000-0000-000000000001')$f$, :'rid'), 'LETZTER_INHABER');
select pg_temp.erwarte_fehler($f$insert into public.restaurants(name) values ('Direkt')$f$, 'permission denied');
select pg_temp.erwarte_fehler($f$update public.mitglieder set rolle='inhaber'$f$, 'permission denied');

-- Manager: darf Azubi holen, aber keine Manager/Inhaber anfassen
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.mitglied_hinzufuegen(:'rid','azubi@test.de','Ali','azubi',false);
select pg_temp.erwarte_fehler(format($f$select public.mitglied_hinzufuegen(%L,'fremd@test.de','F','manager',true)$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_aendern(%L,'00000000-0000-0000-0000-000000000001','azubi',false)$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_aendern(%L,'00000000-0000-0000-0000-000000000003','manager',true)$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select public.mitglied_aendern(:'rid','00000000-0000-0000-0000-000000000003','mitarbeiter',true);
select pg_temp.pruefe(public.darf_reservieren(:'rid'), 'Manager darf reservieren');

-- Mitarbeiter: sieht Team, darf nichts verwalten
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.pruefe((select count(*) from public.mitglieder) = 4, 'Mitarbeiter sieht 4 Teammitglieder');
select pg_temp.pruefe(public.darf_reservieren(:'rid'), 'Mitarbeiter mit Freigabe darf reservieren');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_entfernen(%L,'00000000-0000-0000-0000-000000000004')$f$, :'rid'), 'KEINE_BERECHTIGUNG');

-- Azubi ohne Freigabe
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.pruefe(not public.darf_reservieren(:'rid'), 'Azubi ohne Freigabe darf nicht reservieren');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_aendern(%L,'00000000-0000-0000-0000-000000000004','azubi',true)$f$, :'rid'), 'KEINE_BERECHTIGUNG');

-- Fremder: sieht nichts vom anderen Restaurant, hat ein eigenes
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.pruefe((select count(*) from public.restaurants) = 0, 'Fremder sieht kein Restaurant');
select pg_temp.pruefe((select count(*) from public.mitglieder) = 0, 'Fremder sieht kein Team');
select pg_temp.erwarte_fehler(format($f$select public.mitglied_hinzufuegen(%L,'fremd@test.de','F','azubi',false)$f$, :'rid'), 'KEINE_BERECHTIGUNG');
select public.restaurant_anlegen('Anderes Haus','Fremd') as rid2 \gset
select pg_temp.pruefe((select count(*) from public.restaurants) = 1, 'Fremder sieht nur sein Restaurant');
select pg_temp.pruefe((select count(*) from public.mitglieder) = 1, 'Fremder sieht nur sein Team');

-- Nicht angemeldet
reset role; set role anon; set request.jwt.claim.sub = '';
select pg_temp.erwarte_fehler($f$select public.restaurant_anlegen('X','Y')$f$, 'permission denied');
select pg_temp.erwarte_fehler($f$select * from public.restaurants$f$, 'permission denied');
reset role;
select 'ALLE TESTS BESTANDEN' as ergebnis;
