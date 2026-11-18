-- Lokaler Test der Warteliste. Läuft nach test_0001 bis test_0005.
-- 2030-01-08 ist ein Dienstag (17:00–01:00 geöffnet). Tische: 1 (4 Pl.), 2 (2 Pl.), 3 (6 Pl.).
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
select id as t2 from public.tische where restaurant_id = :'rid' and name = 'Tisch 2' \gset
select id as t3 from public.tische where restaurant_id = :'rid' and name = 'Tisch 3' \gset
delete from public.warteliste; delete from public.reservierungen; delete from public.gaeste;
update public.restaurants set warteliste_modus = 'automatisch', warteliste_frist_minuten = 15,
  nachrichten_modus = 'test', vergabe_modus = 'tische', dauer_modus = 'fest', standard_dauer_minuten = 120 where id = :'rid';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- Alles voll um 18 Uhr
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 4, 'Gast A', '0170 100', :'t1') as ra \gset
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 2, 'Gast B', '0170 200', :'t2') as rb \gset
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 6, 'Gast C', '', :'t3') as rc \gset

insert into public.warteliste (restaurant_id, gast_name, telefon, personen, datum, von, bis)
  values (:'rid', 'Wartend Eins', '0151 1', 2, '2030-01-08', '18:00', '18:30') returning id as w1 \gset
insert into public.warteliste (restaurant_id, gast_name, telefon, personen, datum, von, bis)
  values (:'rid', 'Wartend Zwei', '0151 2', 2, '2030-01-08', '18:00', '19:00') returning id as w2 \gset
insert into public.warteliste (restaurant_id, gast_name, telefon, personen, datum, von, bis)
  values (:'rid', 'Ohne Telefon', '', 2, '2030-01-08', '18:00', '19:00') returning id as w3 \gset
insert into public.warteliste (restaurant_id, gast_name, telefon, personen, datum, von, bis)
  values (:'rid', 'Bekannt', '+49 170 100', 2, '2030-01-09', '18:00', '19:00') returning id as wk \gset
select pg_temp.pruefe((select gast_id is not null from public.warteliste where id = :'wk'), 'bekannte Nummer: mit Karteikarte verknuepft');
select pg_temp.erwarte_fehler(format($f$insert into public.warteliste (restaurant_id, gast_name, personen, datum, von, bis) values (%L, 'X', 2, '2030-01-08', '19:00', '18:00')$f$, :'rid'), 'check');
select pg_temp.pruefe((select freie_zeit is null from public.warteliste_tag(:'rid', '2030-01-08') where id = :'w1'), 'alles voll: keine freie Zeit');
select pg_temp.pruefe((select count(*) from public.warteliste_tag(:'rid', '2030-01-08')) = 3, 'Tagesliste: 3 Eintraege');

-- Storno von Tisch 2: der Erste bekommt automatisch ein Angebot
select public.reservierung_status_setzen(:'rb', 'storniert');
select pg_temp.pruefe((select status = 'angeboten' and angebot_uhrzeit = '18:00' and length(schluessel) = 12 from public.warteliste where id = :'w1'), 'Erster bekommt Angebot fuer 18:00');
select pg_temp.pruefe((select status = 'wartet' from public.warteliste where id = :'w2'), 'Zweiter wartet (nur ein Angebot gleichzeitig)');
select pg_temp.pruefe((select count(*) = 1 and bool_and(text like 'Zur Linde: Ein Tisch ist frei! 08.01., 18:00 Uhr, 2 Pers. Zusagen innerhalb 15 Min.: https://gastro-software.vercel.app/w/%')
  from public.nachrichten where warteliste_id = :'w1' and art = 'warteliste'), 'SMS-Angebot erzeugt');
reset role;
select schluessel as s1 from public.warteliste where id = :'w1' \gset

-- Gast sagt über den Link zu
set role anon; set request.jwt.claim.sub = '';
select pg_temp.pruefe((select offen and uhrzeit = '18:00' and restaurant = 'Zur Linde' from public.warteliste_per_link(:'s1')), 'Link zeigt offenes Angebot');
select pg_temp.erwarte_fehler($f$select * from public.warteliste$f$, 'permission denied');
select pg_temp.erwarte_fehler(format($f$select public.warteliste_anbieten(%L)$f$, :'w2'), 'permission denied');
select pg_temp.pruefe(public.warteliste_antworten(:'s1', true) = 'GEBUCHT', 'Zusage bucht den Tisch');
select pg_temp.pruefe(public.warteliste_antworten(:'s1', true) = 'GEBUCHT', 'zweite Zusage: bleibt gebucht');
reset role;
select pg_temp.pruefe((select a.tisch_id = :'t2' and a.quelle = 'web' and a.notiz = 'Von der Warteliste.' and a.gast_id is not null
  from public.warteliste w join public.reservierungen a on a.id = w.reservierung_id where w.id = :'w1'), 'Reservierung an Tisch 2, als Wartelisten-Buchung');
select pg_temp.pruefe((select count(*) from public.nachrichten n join public.warteliste w on w.reservierung_id = n.reservierung_id
  where w.id = :'w1' and n.art = 'bestaetigung') = 1, 'Gast bekommt Bestaetigung mit Absage-Link');

-- Nächster Storno, der Zweite lehnt ab, der ohne Telefon wird übersprungen
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.reservierung_status_setzen(:'ra', 'storniert');
reset role;
select pg_temp.pruefe((select status = 'angeboten' from public.warteliste where id = :'w2'), 'Zweiter bekommt das naechste Angebot');
select schluessel as s2 from public.warteliste where id = :'w2' \gset
set role anon; set request.jwt.claim.sub = '';
select pg_temp.pruefe(public.warteliste_antworten(:'s2', false) = 'ABGELEHNT', 'Absage durch den Gast');
reset role;
select pg_temp.pruefe((select status = 'wartet' from public.warteliste where id = :'w3'), 'ohne Telefon: kein automatisches Angebot');

-- Angebot läuft ab
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.warteliste (restaurant_id, gast_name, telefon, personen, datum, von, bis)
  values (:'rid', 'Langsam', '0151 4', 2, '2030-01-08', '18:00', '19:00') returning id as w4 \gset
select public.reservierung_status_setzen(:'rc', 'storniert');
reset role;
select pg_temp.pruefe((select status = 'angeboten' from public.warteliste where id = :'w4'), 'Vierter bekommt Angebot');
update public.warteliste set angebot_bis = now() - interval '1 minute' where id = :'w4';
select schluessel as s4 from public.warteliste where id = :'w4' \gset
set role anon; set request.jwt.claim.sub = '';
select pg_temp.pruefe(public.warteliste_antworten(:'s4', true) = 'ABGELAUFEN', 'zu spaete Zusage: abgelaufen');
reset role;
select public.warteliste_ablauf();
select pg_temp.pruefe((select status = 'abgelaufen' from public.warteliste where id = :'w4'), 'Ablauf setzt abgelaufen');

-- Angebot von Hand, aber in der Zwischenzeit vergeben
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.warteliste (restaurant_id, gast_name, telefon, personen, datum, von, bis)
  values (:'rid', 'Pech', '0151 5', 2, '2030-01-08', '18:00', '18:00') returning id as w5 \gset
select pg_temp.erwarte_fehler(format($f$select public.warteliste_anbieten(%L)$f$, :'w3'), 'TELEFON_FEHLT');
select pg_temp.pruefe(public.warteliste_anbieten(:'w5'), 'Team schickt Angebot von Hand');
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 4, 'Schneller', '', :'t1');
select public.reservierung_anlegen(:'rid', '2030-01-08', '18:00', 6, 'Noch schneller', '', :'t3');
reset role;
select schluessel as s5 from public.warteliste where id = :'w5' \gset
set role anon; set request.jwt.claim.sub = '';
select pg_temp.pruefe(public.warteliste_antworten(:'s5', true) = 'NICHT_MEHR_FREI', 'inzwischen vergeben');
reset role;
select pg_temp.pruefe((select status = 'wartet' and angebot_bis is null from public.warteliste where id = :'w5'), 'Gast bleibt auf der Liste');

-- Manueller Modus: kein Automatik-Angebot, Team trägt ein
update public.restaurants set warteliste_modus = 'manuell' where id = :'rid';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select id as rs from public.reservierungen where gast_name = 'Schneller' \gset
select public.reservierung_status_setzen(:'rs', 'storniert');
select pg_temp.pruefe((select status = 'wartet' from public.warteliste where id = :'w5'), 'manuell: kein automatisches Angebot');
select pg_temp.pruefe((select freie_zeit = '18:00' from public.warteliste_tag(:'rid', '2030-01-08') where id = :'w5'), 'Team sieht: frei um 18:00');

-- Rechte
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.pruefe((select count(*) from public.warteliste_tag(:'rid', '2030-01-08')) >= 5, 'Azubi sieht die Warteliste');
select pg_temp.erwarte_fehler(format($f$insert into public.warteliste (restaurant_id, gast_name, personen, datum, von, bis) values (%L, 'Azubi', 2, '2030-01-08', '18:00', '19:00')$f$, :'rid'), 'row-level security');
select pg_temp.erwarte_fehler(format($f$select public.warteliste_anbieten(%L)$f$, :'w5'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.warteliste_eintragen(%L, '18:00')$f$, :'w5'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.warteliste_entfernen(%L)$f$, :'w5'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler($f$select public.warteliste_ablauf()$f$, 'permission denied');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.pruefe((select count(*) from public.warteliste_tag(:'rid', '2030-01-08')) = 0, 'Fremder sieht keine Warteliste');
select pg_temp.erwarte_fehler(format($f$select public.warteliste_anbieten(%L)$f$, :'w5'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format($f$select public.warteliste_eintragen(%L, '18:00')$f$, :'w5'), 'EINTRAG_UNBEKANNT');
select pg_temp.pruefe((select count(*) from public.warteliste_freie_zeit(:'w5')) = 0, 'Fremder bekommt keine freie Zeit');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select public.warteliste_eintragen(:'w5', '18:00') as rw \gset
select pg_temp.pruefe((select status = 'gebucht' and reservierung_id = :'rw' from public.warteliste where id = :'w5'), 'Mitarbeiter traegt von der Warteliste ein');
select public.warteliste_entfernen(:'w3');
select pg_temp.pruefe((select status = 'entfernt' from public.warteliste where id = :'w3'), 'Eintrag entfernt');
reset role;

update public.restaurants set warteliste_modus = 'manuell' where id = :'rid';
delete from public.warteliste; delete from public.reservierungen; delete from public.gaeste;
select 'ALLE TESTS BESTANDEN' as ergebnis;
