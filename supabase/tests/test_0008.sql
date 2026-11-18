-- Lokaler Test des Feedback-Moduls und des Wochenberichts.
-- Vault und pg_net werden hier nachgebildet, um den Weg zu Claude zu prüfen.
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
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ad', 'anbieter@test.de');
insert into public.plattform_admins values ('00000000-0000-0000-0000-0000000000ad');

-- Ohne Vault: Bericht nur mit Zahlen
reset role;
select public.wochenbericht_erstellen() as b0 \gset
select pg_temp.pruefe((select status = 'ohne_ki' and anzahl = 0 from public.wochenberichte where id = :'b0'), 'leerer Bericht ohne KI');

set role authenticated;
-- Mitarbeiter Sven schickt einen Wunsch, Azubi ein Problem, Fremder im eigenen Haus Lob
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select public.feedback_senden(:'rid', 'wunsch', 'Bitte einen Dienstplan mit Schichttausch') as f1 \gset
select pg_temp.erwarte_fehler(format('select public.feedback_senden(%L, ''wunsch'', ''Hallo'')', :'rid2'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler(format('select public.feedback_senden(%L, ''lob'', ''  '')', :'rid'), 'EINGABE_FEHLT');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select public.feedback_senden(:'rid', 'problem', 'Die Seite lädt am Handy langsam') as f2 \gset
select pg_temp.pruefe((select count(*) from public.feedback) = 1, 'Azubi sieht nur den eigenen Eintrag');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.pruefe((select count(*) from public.feedback) = 2, 'Leitung sieht alle Einträge des Betriebs');
select pg_temp.erwarte_fehler(format('update public.feedback set status = ''erledigt'' where id = %L', :'f1'), 'permission denied');
select pg_temp.erwarte_fehler(format('select public.feedback_beantworten(%L, ''geplant'', ''kommt'')', :'f1'), 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler('select * from public.feedback_uebersicht()', 'KEINE_BERECHTIGUNG');
select pg_temp.erwarte_fehler('select public.wochenbericht_erstellen()', 'KEINE_BERECHTIGUNG');
select pg_temp.pruefe((select count(*) from public.wochenberichte) = 0, 'Betriebe sehen keine Wochenberichte');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public.feedback_senden(:'rid2', 'lob', 'Die Warteliste ist super') as f3 \gset
select pg_temp.pruefe((select count(*) from public.feedback) = 1, 'anderer Betrieb sieht nur sich');

-- Anbieter
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
select pg_temp.pruefe((select count(*) from public.feedback_uebersicht()) = 3, 'Anbieter sieht alle Betriebe');
select pg_temp.pruefe((select restaurant from public.feedback_uebersicht() where id = :'f3') = 'Anderes Haus', 'Übersicht mit Betriebsnamen');
select public.feedback_beantworten(:'f1', 'geplant', 'Kommt im Frühjahr');
select pg_temp.pruefe(public.ki_bereit() = false, 'ohne Vault kein Schlüssel');

-- Betrieb sieht Antwort
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.pruefe((select status = 'geplant' and antwort = 'Kommt im Frühjahr' and beantwortet_am is not null from public.feedback where id = :'f1'), 'Antwort kommt beim Betrieb an');

-- Begrenzung: höchstens 20 am Tag
reset role;
insert into public.feedback (restaurant_id, user_id, wer, art, text)
  select :'rid', '00000000-0000-0000-0000-000000000003', 'Sven', 'wunsch', 'Füllung ' || g from generate_series(1, 19) g;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.erwarte_fehler(format('select public.feedback_senden(%L, ''wunsch'', ''noch einer'')', :'rid'), 'ZU_VIELE');
reset role;
delete from public.feedback where text like 'Füllung %';

-- Vault und pg_net nachbilden
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('anthropic_api_key', 'test-schluessel');
create schema net;
create table net._http_response (id bigint primary key, status_code integer, content text, error_msg text);
create table net.anfragen (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
language sql as $$ insert into net.anfragen (url, body, headers) values (url, body, headers) returning id $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
select pg_temp.pruefe(public.ki_bereit() = true, 'Schlüssel erkannt');
select public.wochenbericht_erstellen() as b1 \gset
reset role;
select pg_temp.pruefe((select status = 'wartet' and anzahl = 3 and (statistik->>'wunsch')::int = 1 and (statistik->>'betriebe')::int = 2 from public.wochenberichte where id = :'b1'), 'Bericht wartet auf Claude, Zahlen stimmen');
select pg_temp.pruefe((select headers->>'x-api-key' = 'test-schluessel' and body->>'model' = 'claude-sonnet-5-5' from net.anfragen), 'Anfrage an Claude mit Schlüssel');
select pg_temp.pruefe((select body::text not like '%Sven%' and body::text not like '%Zur Linde%' and body::text like '%Betrieb 1%' and body::text like '%Dienstplan%' from net.anfragen), 'keine Namen von Personen oder Betrieben an die KI');
select pg_temp.pruefe(public.wochenberichte_abholen() = 0, 'noch keine Antwort');
insert into net._http_response select id, 200, '{"content":[{"type":"text","text":"Das Wichtigste: Dienstplan gewünscht."}]}', null from net.anfragen;
select pg_temp.pruefe(public.wochenberichte_abholen() = 1, 'Antwort abgeholt');
select pg_temp.pruefe((select status = 'fertig' and text like 'Das Wichtigste%' from public.wochenberichte where id = :'b1'), 'Bericht fertig');
-- Fehlerantwort
select public.wochenbericht_erstellen() as b2 \gset
insert into net._http_response select max(id), 401, '{"error":{"message":"invalid x-api-key"}}', null from net.anfragen;
select public.wochenberichte_abholen();
select pg_temp.pruefe((select status = 'fehler' and text like '%401%invalid x-api-key%' from public.wochenberichte where id = :'b2'), 'Fehler wird verständlich gespeichert');
-- Gelöschtes Restaurant nimmt sein Feedback mit
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public.restaurant_loeschen(:'rid2', 'Anderes Haus');
reset role;
select pg_temp.pruefe(not exists (select 1 from public.feedback where id = :'f3'), 'Feedback wird mit dem Restaurant gelöscht');
select 'ALLE TESTS BESTANDEN';
