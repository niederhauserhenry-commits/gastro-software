-- Schritt 9: Telefon-KI (Retell).
-- Retell ruft während des Gesprächs unsere Schnittstelle /api/telefon auf. Die prüft
-- die Signatur von Retell und ruft dann diese Funktionen mit dem geheimen Schlüssel
-- des Restaurants auf. Ohne gültigen Schlüssel und ohne eingeschaltete Telefon-KI
-- liefern sie nichts. Gebucht wird über dieselbe Funktion wie im Haus, also mit
-- demselben Doppelbuchungsschutz.

alter table public.restaurants
  add column telefon_aktiv boolean not null default false,
  add column telefon_hinweise text not null default '' check (char_length(telefon_hinweise) <= 1500),
  add column telefon_max_personen integer not null default 8 check (telefon_max_personen between 1 and 50);

-- Der Schlüssel liegt in einer eigenen Tabelle, damit ihn nur die Leitung sieht.
create table public.telefon_zugang (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  schluessel text not null unique default replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4),
  erstellt_am timestamptz not null default now()
);
alter table public.telefon_zugang enable row level security;
create policy telefon_zugang_lesen on public.telefon_zugang for select to authenticated
  using (public.ist_leitung(restaurant_id));
revoke all on public.telefon_zugang from anon, authenticated;
grant select on public.telefon_zugang to authenticated;

create function public.telefon_einstellungen_speichern(
  p_restaurant uuid, p_aktiv boolean, p_hinweise text, p_max_personen integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ist_leitung(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if p_max_personen is null or p_max_personen < 1 or p_max_personen > 50 then
    raise exception 'ZAHL_UNGUELTIG';
  end if;
  update public.restaurants
    set telefon_aktiv = coalesce(p_aktiv, false),
        telefon_hinweise = left(btrim(coalesce(p_hinweise, '')), 1500),
        telefon_max_personen = p_max_personen
    where id = p_restaurant;
  insert into public.telefon_zugang (restaurant_id) values (p_restaurant) on conflict do nothing;
end;
$$;

-- Neuer Schlüssel, zum Beispiel wenn der alte in falsche Hände geraten ist.
create function public.telefon_schluessel_erneuern(p_restaurant uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ist_leitung(p_restaurant) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  insert into public.telefon_zugang (restaurant_id) values (p_restaurant)
    on conflict (restaurant_id) do update
      set schluessel = replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4), erstellt_am = now();
  perform public.protokollieren(p_restaurant, 'einstellungen_geaendert', null, 'Telefon-KI: neuer Schlüssel');
end;
$$;

-- Restaurant zum Schlüssel, nur wenn die Telefon-KI eingeschaltet ist.
create function public.telefon_restaurant(p_schluessel text) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.telefon_zugang z join public.restaurants r on r.id = z.restaurant_id
  where z.schluessel = p_schluessel and r.telefon_aktiv and char_length(coalesce(p_schluessel, '')) = 36;
$$;

-- Alle freien Anfangszeiten an einem Tag für so viele Personen.
create function public.telefon_freie_zeiten(p_restaurant uuid, p_datum date, p_personen integer)
returns table (uhrzeit time, durchgang uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.restaurants%rowtype;
  d record;
  o record;
  v_t time;
  v_bis time;
  v_beginn timestamptz;
  v_ende timestamptz;
  v_block timestamptz;
  v_frueheste timestamptz := now() + interval '30 minutes';
begin
  select * into r from public.restaurants where id = p_restaurant;
  if r.id is null or p_personen < 1 or p_personen > r.telefon_max_personen then
    return;
  end if;

  if r.dauer_modus = 'durchgaenge' then
    for d in
      select * from public.durchgaenge
      where restaurant_id = r.id and (wochentag is null or wochentag = extract(isodow from p_datum))
      order by von
    loop
      v_beginn := (p_datum + d.von) at time zone r.zeitzone;
      v_ende := (case when d.bis > d.von then p_datum + d.bis else p_datum + 1 + d.bis end) at time zone r.zeitzone;
      if v_beginn > v_frueheste and public.zeitraum_frei(r.id, v_beginn, v_ende, p_personen) then
        uhrzeit := d.von;
        durchgang := d.id;
        return next;
      end if;
    end loop;
    return;
  end if;

  for o in
    select von, bis from public.oeffnungszeiten
    where restaurant_id = r.id and wochentag = extract(isodow from p_datum)
    order by von
  loop
    v_t := o.von;
    -- Letzte Anfangszeit eine halbe Stunde vor Schluss. Über Mitternacht: bis 23:45.
    v_bis := case when o.bis > o.von then o.bis - interval '30 minutes' else time '23:45' end;
    while v_t <= v_bis loop
      v_beginn := (p_datum + v_t) at time zone r.zeitzone;
      select block_ende into v_block from public.oeffnungsblock(r.id, p_datum, v_t, r.zeitzone);
      if v_block is not null and v_beginn > v_frueheste then
        v_ende := case when r.dauer_modus = 'offen' and v_block > v_beginn then v_block
                       else v_beginn + make_interval(mins => r.standard_dauer_minuten) end;
        if public.zeitraum_frei(r.id, v_beginn, v_ende, p_personen) then
          uhrzeit := v_t;
          durchgang := null;
          return next;
        end if;
      end if;
      exit when v_t >= time '23:45';
      v_t := v_t + interval '15 minutes';
    end loop;
  end loop;
end;
$$;

-- Grunddaten für das Gespräch: Name, heutiges Datum, Öffnungszeiten, Hinweise.
create function public.telefon_info(p_schluessel text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := public.telefon_restaurant(p_schluessel);
  r public.restaurants%rowtype;
  v_tage text[] := array['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  v_jetzt timestamp;
begin
  if v_id is null then
    raise exception 'TELEFON_NICHT_AKTIV';
  end if;
  select * into r from public.restaurants where id = v_id;
  v_jetzt := now() at time zone r.zeitzone;
  return jsonb_build_object(
    'restaurant', r.name,
    'heute', to_char(v_jetzt, 'YYYY-MM-DD'),
    'wochentag_heute', v_tage[extract(isodow from v_jetzt)::int],
    'uhrzeit_jetzt', to_char(v_jetzt, 'HH24:MI'),
    'oeffnungszeiten', coalesce((
      select jsonb_agg(jsonb_build_object('tag', v_tage[w], 'zeiten',
        coalesce((select string_agg(to_char(o.von, 'HH24:MI') || ' bis ' || to_char(o.bis, 'HH24:MI'), ' und ' order by o.von)
                  from public.oeffnungszeiten o where o.restaurant_id = r.id and o.wochentag = w), 'geschlossen')) order by w)
      from generate_series(1, 7) w), '[]'::jsonb),
    'max_personen_telefon', r.telefon_max_personen,
    'hinweise', r.telefon_hinweise
  );
end;
$$;

-- Ist zum Wunschtermin frei? Sonst die nächsten freien Zeiten am selben Tag.
create function public.telefon_anfrage(p_schluessel text, p_datum date, p_uhrzeit time, p_personen integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := public.telefon_restaurant(p_schluessel);
  r public.restaurants%rowtype;
  v_zeiten time[];
  v_wunsch time;
  v_heute date;
begin
  if v_id is null then
    raise exception 'TELEFON_NICHT_AKTIV';
  end if;
  select * into r from public.restaurants where id = v_id;
  v_heute := (now() at time zone r.zeitzone)::date;
  if p_datum is null or p_datum < v_heute then
    return jsonb_build_object('ergebnis', 'datum_vergangen');
  end if;
  if p_datum > v_heute + 365 then
    return jsonb_build_object('ergebnis', 'zu_weit_voraus');
  end if;
  if p_personen is null or p_personen < 1 then
    return jsonb_build_object('ergebnis', 'personen_fehlen');
  end if;
  if p_personen > r.telefon_max_personen then
    return jsonb_build_object('ergebnis', 'gruppe_zu_gross', 'max_personen', r.telefon_max_personen);
  end if;
  if not exists (select 1 from public.oeffnungszeiten where restaurant_id = r.id and wochentag = extract(isodow from p_datum)) then
    return jsonb_build_object('ergebnis', 'geschlossen');
  end if;

  select array_agg(z.uhrzeit order by z.uhrzeit) into v_zeiten from public.telefon_freie_zeiten(r.id, p_datum, p_personen) z;
  if v_zeiten is null then
    return jsonb_build_object('ergebnis', 'ausgebucht');
  end if;
  -- Wunschzeit auf die nächste Viertelstunde runden.
  if p_uhrzeit is not null then
    v_wunsch := time '00:00' + make_interval(mins => (ceil(extract(epoch from p_uhrzeit) / 900) * 15)::int);
    if v_wunsch = any (v_zeiten) then
      return jsonb_build_object('ergebnis', 'frei', 'uhrzeit', to_char(v_wunsch, 'HH24:MI'));
    end if;
    return jsonb_build_object('ergebnis', 'wunschzeit_belegt', 'alternativen', (
      select jsonb_agg(to_char(t, 'HH24:MI') order by t) from (
        select t from unnest(v_zeiten) t
        order by abs(extract(epoch from t) - extract(epoch from v_wunsch)) limit 4) n));
  end if;
  return jsonb_build_object('ergebnis', 'freie_zeiten', 'zeiten', (
    select jsonb_agg(to_char(t, 'HH24:MI') order by t) from unnest(v_zeiten) t));
end;
$$;

-- Bucht wie im Haus, Quelle "telefon_ki". Höchstens 30 Buchungen pro Stunde über das Telefon.
create function public.telefon_buchen(
  p_schluessel text, p_datum date, p_uhrzeit time, p_personen integer,
  p_name text, p_telefon text, p_anlass text default '', p_notiz text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := public.telefon_restaurant(p_schluessel);
  r public.restaurants%rowtype;
  v_durchgang uuid;
  v_res uuid;
  v_frei jsonb;
begin
  if v_id is null then
    raise exception 'TELEFON_NICHT_AKTIV';
  end if;
  select * into r from public.restaurants where id = v_id;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    return jsonb_build_object('ergebnis', 'name_fehlt');
  end if;
  if public.telefon_normal(p_telefon) = '' then
    return jsonb_build_object('ergebnis', 'telefon_fehlt');
  end if;
  if (select count(*) from public.reservierungen
      where restaurant_id = v_id and quelle = 'telefon_ki' and erstellt_am > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ergebnis', 'zu_viele_buchungen');
  end if;

  v_frei := public.telefon_anfrage(p_schluessel, p_datum, p_uhrzeit, p_personen);
  if v_frei ->> 'ergebnis' <> 'frei' then
    return v_frei;
  end if;
  select z.durchgang into v_durchgang from public.telefon_freie_zeiten(v_id, p_datum, p_personen) z
    where z.uhrzeit = (v_frei ->> 'uhrzeit')::time;

  begin
    v_res := public.reservierung_buchen(v_id, p_datum, (v_frei ->> 'uhrzeit')::time, p_personen,
      left(btrim(p_name), 80), left(btrim(p_telefon), 40), null, v_durchgang,
      left(btrim(coalesce(p_anlass, '')), 120), left(btrim(coalesce(p_notiz, '')), 300), 'telefon_ki', false, null, null);
  exception when others then
    -- In der Zwischenzeit vergeben oder anderer Grund: neu anbieten.
    return jsonb_build_object('ergebnis', 'gerade_vergeben',
      'alternativen', public.telefon_anfrage(p_schluessel, p_datum, p_uhrzeit, p_personen) -> 'alternativen');
  end;
  return jsonb_build_object('ergebnis', 'gebucht', 'datum', to_char(p_datum, 'DD.MM.YYYY'),
    'uhrzeit', v_frei ->> 'uhrzeit', 'personen', p_personen, 'name', left(btrim(p_name), 80));
end;
$$;

-- Änderungen an der Telefon-KI ins Änderungsprotokoll.
create or replace function public.protokoll_restaurants() returns trigger
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
  if new.telefon_aktiv is distinct from old.telefon_aktiv or new.telefon_hinweise is distinct from old.telefon_hinweise
     or new.telefon_max_personen is distinct from old.telefon_max_personen then
    v_felder := array_append(v_felder, (case when new.telefon_aktiv then 'Telefon-KI an' else 'Telefon-KI aus' end)::text);
  end if;
  if cardinality(v_felder) > 0 then
    perform public.protokollieren(new.id, 'einstellungen_geaendert', null, array_to_string(v_felder, ', '));
  end if;
  return new;
end;
$$;

revoke execute on function
  public.telefon_einstellungen_speichern(uuid, boolean, text, integer),
  public.telefon_schluessel_erneuern(uuid),
  public.telefon_restaurant(text),
  public.telefon_freie_zeiten(uuid, date, integer),
  public.telefon_info(text),
  public.telefon_anfrage(text, date, time, integer),
  public.telefon_buchen(text, date, time, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.telefon_einstellungen_speichern(uuid, boolean, text, integer),
  public.telefon_schluessel_erneuern(uuid)
  to authenticated;
grant execute on function
  public.telefon_info(text),
  public.telefon_anfrage(text, date, time, integer),
  public.telefon_buchen(text, date, time, integer, text, text, text, text)
  to anon, authenticated;
