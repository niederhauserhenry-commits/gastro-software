-- Schritt 11: Datenschutz und Nachvollziehbarkeit
--   Änderungsprotokoll: wer hat wann was geändert (ohne Gesundheitsdaten im Protokoll)
--   Datenauskunft für einen Gast (Art. 15 DSGVO) als vollständige Zusammenstellung
--   Gäste aus einem alten System importieren
--   Restaurant mit allen Daten löschen (nur Inhaber, mit Bestätigung durch den Namen)

create table public.protokoll (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  wer text not null default '',
  aktion text not null,
  objekt_id uuid,
  details text not null default '',
  zeit timestamptz not null default now()
);
create index protokoll_restaurant_idx on public.protokoll (restaurant_id, zeit desc);

-- Nur die Leitung sieht das Protokoll. Geschrieben wird ausschließlich vom System.
alter table public.protokoll enable row level security;
create policy protokoll_lesen on public.protokoll
  for select to authenticated using (public.ist_leitung(restaurant_id));
revoke all on public.protokoll from anon, authenticated;
grant select on public.protokoll to authenticated;

create function public.protokollieren(p_restaurant uuid, p_aktion text, p_objekt uuid, p_details text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_wer text;
begin
  -- Nächtliche Systemläufe schreiben selbst eine Zusammenfassung.
  if current_setting('gastro.system', true) = 'an' then
    return;
  end if;
  if auth.uid() is null then
    v_wer := 'Gast oder System';
  else
    select anzeigename into v_wer from public.mitglieder where restaurant_id = p_restaurant and user_id = auth.uid();
  end if;
  insert into public.protokoll (restaurant_id, user_id, wer, aktion, objekt_id, details)
    values (p_restaurant, auth.uid(), coalesce(v_wer, ''), p_aktion, p_objekt, left(coalesce(p_details, ''), 300));
end;
$$;

-- Karteikarten: Bei Änderungen werden nur die Namen der Felder festgehalten,
-- nie die Inhalte. So landen keine Allergien oder Notizen im Protokoll.
create function public.protokoll_gaeste() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_felder text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.protokollieren(new.restaurant_id, 'gast_angelegt', new.id, '');
    return new;
  elsif tg_op = 'DELETE' then
    perform public.protokollieren(old.restaurant_id, 'gast_geloescht', old.id, '');
    return old;
  end if;
  if new.name is distinct from old.name then v_felder := array_append(v_felder, 'Name'::text); end if;
  if new.telefon is distinct from old.telefon then v_felder := array_append(v_felder, 'Telefon'::text); end if;
  if new.email is distinct from old.email then v_felder := array_append(v_felder, 'E-Mail'::text); end if;
  if new.geburtstag is distinct from old.geburtstag then v_felder := array_append(v_felder, 'Geburtstag'::text); end if;
  if new.vorlieben is distinct from old.vorlieben then v_felder := array_append(v_felder, 'Vorlieben'::text); end if;
  if new.notizen is distinct from old.notizen then v_felder := array_append(v_felder, 'Notizen'::text); end if;
  if new.allergien is distinct from old.allergien then v_felder := array_append(v_felder, 'Allergien'::text); end if;
  if cardinality(v_felder) > 0 then
    perform public.protokollieren(new.restaurant_id, 'gast_geaendert', new.id, array_to_string(v_felder, ', '));
  end if;
  return new;
end;
$$;
create trigger protokoll_gaeste after insert or update or delete on public.gaeste
  for each row execute function public.protokoll_gaeste();

create function public.protokoll_reservierungen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_zone text;
begin
  select zeitzone into v_zone from public.restaurants where id = new.restaurant_id;
  if tg_op = 'INSERT' then
    perform public.protokollieren(new.restaurant_id, 'reservierung_angelegt', new.id,
      to_char(new.beginn at time zone v_zone, 'DD.MM.YYYY HH24:MI') || ', ' || new.personen || ' Pers., ' || new.quelle);
  elsif new.status is distinct from old.status then
    perform public.protokollieren(new.restaurant_id, 'reservierung_status', new.id,
      to_char(new.beginn at time zone v_zone, 'DD.MM.YYYY HH24:MI') || ': ' || old.status || ' -> ' || new.status
      || case when new.abgesagt_vom_gast and not old.abgesagt_vom_gast then ' (vom Gast über den Link)' else '' end);
  end if;
  return new;
end;
$$;
create trigger protokoll_reservierungen after insert or update of status on public.reservierungen
  for each row execute function public.protokoll_reservierungen();

create function public.protokoll_mitglieder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.protokollieren(new.restaurant_id, 'team_hinzugefuegt', new.user_id,
      new.anzeigename || ' als ' || new.rolle || case when new.darf_reservieren then ', darf reservieren' else '' end);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.protokollieren(old.restaurant_id, 'team_entfernt', old.user_id, old.anzeigename);
    return old;
  end if;
  if new.rolle is distinct from old.rolle or new.darf_reservieren is distinct from old.darf_reservieren then
    perform public.protokollieren(new.restaurant_id, 'team_geaendert', new.user_id,
      new.anzeigename || ': ' || new.rolle || case when new.darf_reservieren then ', darf reservieren' else ', darf nicht reservieren' end);
  end if;
  return new;
end;
$$;
create trigger protokoll_mitglieder after insert or update or delete on public.mitglieder
  for each row execute function public.protokoll_mitglieder();

create function public.protokoll_restaurants() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_felder text[] := '{}';
begin
  if new.vergabe_modus is distinct from old.vergabe_modus or new.plaetze_gesamt is distinct from old.plaetze_gesamt then
    v_felder := array_append(v_felder, 'Tischvergabe'::text);
  end if;
  if new.dauer_modus is distinct from old.dauer_modus or new.standard_dauer_minuten is distinct from old.standard_dauer_minuten then
    v_felder := array_append(v_felder, 'Tischdauer'::text);
  end if;
  if new.warteliste_modus is distinct from old.warteliste_modus or new.warteliste_frist_minuten is distinct from old.warteliste_frist_minuten then
    v_felder := array_append(v_felder, 'Warteliste'::text);
  end if;
  if new.loeschfrist_monate is distinct from old.loeschfrist_monate then
    v_felder := array_append(v_felder, ('Löschfrist ' || new.loeschfrist_monate || ' Monate')::text);
  end if;
  if new.nachrichten_modus is distinct from old.nachrichten_modus or new.erinnerung_stunden is distinct from old.erinnerung_stunden
     or new.vorlage_bestaetigung is distinct from old.vorlage_bestaetigung or new.vorlage_erinnerung is distinct from old.vorlage_erinnerung
     or new.vorlage_warteliste is distinct from old.vorlage_warteliste then
    v_felder := array_append(v_felder, 'Nachrichten'::text);
  end if;
  if cardinality(v_felder) > 0 then
    perform public.protokollieren(new.id, 'einstellungen_geaendert', null, array_to_string(v_felder, ', '));
  end if;
  return new;
end;
$$;
create trigger protokoll_restaurants after update on public.restaurants
  for each row execute function public.protokoll_restaurants();

-- Für Aktionen ohne eigene Tabellenänderung: Export und Datenauskunft.
create function public.protokoll_eintragen(p_restaurant uuid, p_aktion text, p_details text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ist_leitung(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if p_aktion not in ('export') then
    raise exception 'EINGABE_FEHLT';
  end if;
  perform public.protokollieren(p_restaurant, p_aktion, null, p_details);
end;
$$;

-- Datenauskunft: alles, was über einen Gast gespeichert ist, in einem Dokument.
create function public.gast_auskunft(p_gast uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.gaeste%rowtype;
  r public.restaurants%rowtype;
  v jsonb;
begin
  select * into g from public.gaeste where id = p_gast;
  if g.id is null or not public.ist_leitung(g.restaurant_id) then
    raise exception 'GAST_UNBEKANNT';
  end if;
  select * into r from public.restaurants where id = g.restaurant_id;
  v := jsonb_build_object(
    'erstellt_am', to_char(now() at time zone r.zeitzone, 'YYYY-MM-DD HH24:MI'),
    'verantwortlich', r.name,
    'karteikarte', jsonb_build_object(
      'name', g.name, 'telefon', g.telefon, 'email', g.email, 'geburtstag', g.geburtstag,
      'vorlieben', g.vorlieben, 'notizen', g.notizen, 'allergien', g.allergien,
      'einwilligung_allergien_am', to_char(g.allergien_einwilligung_am at time zone r.zeitzone, 'YYYY-MM-DD HH24:MI'),
      'angelegt_am', to_char(g.erstellt_am at time zone r.zeitzone, 'YYYY-MM-DD HH24:MI'),
      'zuletzt_geaendert_am', to_char(g.geaendert_am at time zone r.zeitzone, 'YYYY-MM-DD HH24:MI')),
    'reservierungen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'beginn', to_char(a.beginn at time zone r.zeitzone, 'YYYY-MM-DD HH24:MI'),
        'personen', a.personen, 'tisch', t.name, 'status', a.status, 'quelle', a.quelle,
        'name', a.gast_name, 'telefon', a.telefon, 'anlass', a.anlass, 'notiz', a.notiz,
        'vom_gast_abgesagt', a.abgesagt_vom_gast) order by a.beginn desc)
      from public.reservierungen a left join public.tische t on t.id = a.tisch_id
      where a.gast_id = g.id), '[]'::jsonb),
    'aufenthalte', coalesce((
      select jsonb_agg(jsonb_build_object('zimmer', f.zimmer, 'anreise', f.anreise, 'abreise', f.abreise) order by f.anreise desc)
      from public.aufenthalte f where f.gast_id = g.id), '[]'::jsonb),
    'warteliste', coalesce((
      select jsonb_agg(jsonb_build_object(
        'datum', w.datum, 'von', to_char(w.von, 'HH24:MI'), 'bis', to_char(w.bis, 'HH24:MI'),
        'personen', w.personen, 'status', w.status, 'notiz', w.notiz) order by w.datum desc)
      from public.warteliste w where w.gast_id = g.id), '[]'::jsonb),
    'nachrichten', coalesce((
      select jsonb_agg(jsonb_build_object(
        'art', n.art, 'an', n.an, 'text', n.text, 'status', n.status,
        'zeitpunkt', to_char(n.senden_ab at time zone r.zeitzone, 'YYYY-MM-DD HH24:MI')) order by n.senden_ab desc)
      from public.nachrichten n
      left join public.reservierungen a on a.id = n.reservierung_id
      left join public.warteliste w on w.id = n.warteliste_id
      where a.gast_id = g.id or w.gast_id = g.id), '[]'::jsonb),
    'loeschfrist', 'Die Daten werden ' || r.loeschfrist_monate || ' Monate nach dem letzten Besuch automatisch gelöscht.'
  );
  insert into public.protokoll (restaurant_id, user_id, wer, aktion, objekt_id, details)
    select g.restaurant_id, auth.uid(), coalesce(m.anzeigename, ''), 'auskunft', g.id, ''
    from public.mitglieder m where m.restaurant_id = g.restaurant_id and m.user_id = auth.uid();
  return v;
end;
$$;

-- Gäste aus einem alten System übernehmen. Gleiche Telefonnummern werden
-- übersprungen, ebenso gleiche Namen ohne Telefonnummer.
create function public.gaeste_importieren(p_restaurant uuid, p_zeilen jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  z record;
  v_neu integer := 0;
  v_doppelt integer := 0;
  v_fehler integer := 0;
  v_id uuid;
  v_geb date;
begin
  if not public.ist_leitung(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) > 5000 then
    raise exception 'ZAHL_UNGUELTIG';
  end if;
  perform set_config('gastro.system', 'an', true);
  for z in select * from jsonb_to_recordset(p_zeilen) as x(name text, telefon text, email text, geburtstag text, notizen text) loop
    if coalesce(btrim(z.name), '') = '' then
      v_fehler := v_fehler + 1;
      continue;
    end if;
    begin
      v_geb := case when z.geburtstag ~ '^\d{4}-\d{2}-\d{2}$' then z.geburtstag::date end;
    exception when others then
      v_geb := null;
    end;
    if public.telefon_normal(z.telefon) = '' and exists (
      select 1 from public.gaeste where restaurant_id = p_restaurant and telefon_norm = '' and lower(name) = lower(btrim(z.name))) then
      v_doppelt := v_doppelt + 1;
      continue;
    end if;
    v_id := null;
    begin
      insert into public.gaeste (restaurant_id, name, telefon, email, geburtstag, notizen)
        values (p_restaurant, left(btrim(z.name), 80), left(btrim(coalesce(z.telefon, '')), 40),
                left(btrim(coalesce(z.email, '')), 120), v_geb, left(btrim(coalesce(z.notizen, '')), 1000))
        on conflict (restaurant_id, telefon_norm) where telefon_norm <> '' do nothing
        returning id into v_id;
    exception when others then
      v_fehler := v_fehler + 1;
      continue;
    end;
    if v_id is null then
      v_doppelt := v_doppelt + 1;
    else
      v_neu := v_neu + 1;
    end if;
  end loop;
  perform set_config('gastro.system', '', true);
  perform public.protokollieren(p_restaurant, 'import', null,
    v_neu || ' Gäste übernommen, ' || v_doppelt || ' schon vorhanden, ' || v_fehler || ' ohne Namen');
  return jsonb_build_object('neu', v_neu, 'doppelt', v_doppelt, 'fehler', v_fehler);
end;
$$;

-- Restaurant mit allen Daten löschen. Nur ein Inhaber, nur mit dem genauen Namen.
create function public.restaurant_loeschen(p_restaurant uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.meine_rolle(p_restaurant) is distinct from 'inhaber' then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if not exists (select 1 from public.restaurants where id = p_restaurant and name = btrim(p_name)) then
    raise exception 'NAME_STIMMT_NICHT';
  end if;
  perform set_config('gastro.system', 'an', true);
  delete from public.restaurants where id = p_restaurant;
end;
$$;

-- Nächtliches Aufräumen jetzt mit Zusammenfassung im Protokoll und
-- Löschung von Protokolleinträgen nach 24 Monaten.
create or replace function public.gaeste_aufraeumen() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_grenze timestamptz;
  v_res integer;
  v_gaeste integer;
begin
  perform set_config('gastro.system', 'an', true);
  for r in select id, loeschfrist_monate from public.restaurants loop
    v_grenze := now() - make_interval(months => r.loeschfrist_monate);
    update public.reservierungen
      set gast_name = 'Gelöscht', telefon = '', anlass = '', notiz = '', gast_id = null
      where restaurant_id = r.id and ende < v_grenze and gast_name <> 'Gelöscht';
    get diagnostics v_res = row_count;
    delete from public.gaeste g
      where g.restaurant_id = r.id
        and g.erstellt_am < v_grenze
        and not exists (select 1 from public.reservierungen a where a.gast_id = g.id and a.ende >= v_grenze)
        and not exists (select 1 from public.aufenthalte f where f.gast_id = g.id and f.abreise >= v_grenze::date);
    get diagnostics v_gaeste = row_count;
    update public.warteliste set gast_name = 'Gelöscht', telefon = '', notiz = ''
      where restaurant_id = r.id and datum < v_grenze::date and gast_name <> 'Gelöscht';
    if v_res + v_gaeste > 0 then
      insert into public.protokoll (restaurant_id, wer, aktion, details)
        values (r.id, 'System', 'loeschfrist', v_gaeste || ' Karteikarten gelöscht, ' || v_res || ' Reservierungen anonymisiert');
    end if;
  end loop;
  delete from public.protokoll where zeit < now() - interval '24 months';
  perform set_config('gastro.system', '', true);
end;
$$;

revoke execute on function
  public.protokollieren(uuid, text, uuid, text),
  public.protokoll_gaeste(),
  public.protokoll_reservierungen(),
  public.protokoll_mitglieder(),
  public.protokoll_restaurants(),
  public.protokoll_eintragen(uuid, text, text),
  public.gast_auskunft(uuid),
  public.gaeste_importieren(uuid, jsonb),
  public.restaurant_loeschen(uuid, text),
  public.gaeste_aufraeumen()
  from public, anon, authenticated;
grant execute on function
  public.protokoll_eintragen(uuid, text, text),
  public.gast_auskunft(uuid),
  public.gaeste_importieren(uuid, jsonb),
  public.restaurant_loeschen(uuid, text)
  to authenticated;
