-- Schritt 10: Feedback der Betriebe an den Anbieter (Henry) und KI-Wochenbericht.
-- Jedes Teammitglied kann Wünsche, Probleme oder Lob schicken. Der Anbieter sieht
-- alles gesammelt, antwortet und setzt einen Status, den der Betrieb wieder sieht.
-- Einmal pro Woche fasst Claude die Einträge zusammen. Der API-Schlüssel liegt im
-- Supabase Vault unter dem Namen 'anthropic_api_key' und wird nie im Code gespeichert.
-- Ohne Schlüssel entsteht ein Bericht nur mit Zahlen.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create type public.feedback_art as enum ('wunsch', 'problem', 'lob');
create type public.feedback_status as enum ('neu', 'gelesen', 'geplant', 'erledigt', 'abgelehnt');

-- Wer den Anbieter-Bereich sehen darf. Wird nur direkt in der Datenbank gepflegt.
create table public.plattform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.plattform_admins enable row level security;
revoke all on public.plattform_admins from anon, authenticated;

create function public.ist_plattform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plattform_admins where user_id = (select auth.uid()));
$$;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  wer text not null default '',
  art public.feedback_art not null,
  text text not null check (char_length(btrim(text)) between 3 and 2000),
  status public.feedback_status not null default 'neu',
  antwort text not null default '' check (char_length(antwort) <= 2000),
  beantwortet_am timestamptz,
  erstellt_am timestamptz not null default now()
);
create index feedback_restaurant_idx on public.feedback (restaurant_id, erstellt_am desc);
create index feedback_zeit_idx on public.feedback (erstellt_am desc);

alter table public.feedback enable row level security;
-- Die Leitung sieht alles aus dem eigenen Betrieb, alle anderen ihre eigenen Einträge.
create policy feedback_lesen on public.feedback for select to authenticated
  using (
    (public.ist_mitglied(restaurant_id) and (user_id = (select auth.uid()) or public.ist_leitung(restaurant_id)))
    or public.ist_plattform_admin()
  );
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;

create type public.bericht_status as enum ('wartet', 'fertig', 'ohne_ki', 'fehler');

create table public.wochenberichte (
  id uuid primary key default gen_random_uuid(),
  von timestamptz not null,
  bis timestamptz not null,
  anzahl integer not null,
  statistik jsonb not null default '{}',
  text text not null default '',
  status public.bericht_status not null,
  anfrage_id bigint,
  erstellt_am timestamptz not null default now()
);
alter table public.wochenberichte enable row level security;
create policy wochenberichte_lesen on public.wochenberichte for select to authenticated
  using (public.ist_plattform_admin());
revoke all on public.wochenberichte from anon, authenticated;
grant select on public.wochenberichte to authenticated;

-- Feedback schicken: jedes Mitglied, höchstens 20 Einträge am Tag pro Person.
create function public.feedback_senden(p_restaurant uuid, p_art public.feedback_art, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_wer text;
  v_id uuid;
begin
  select anzeigename into v_wer from public.mitglieder where restaurant_id = p_restaurant and user_id = auth.uid();
  if v_wer is null then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if char_length(btrim(coalesce(p_text, ''))) < 3 then
    raise exception 'EINGABE_FEHLT';
  end if;
  if (select count(*) from public.feedback where user_id = auth.uid() and erstellt_am > now() - interval '1 day') >= 20 then
    raise exception 'ZU_VIELE';
  end if;
  insert into public.feedback (restaurant_id, user_id, wer, art, text)
    values (p_restaurant, auth.uid(), v_wer, p_art, left(btrim(p_text), 2000))
    returning id into v_id;
  return v_id;
end;
$$;

-- Anbieter: Status setzen und antworten.
create function public.feedback_beantworten(p_id uuid, p_status public.feedback_status, p_antwort text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ist_plattform_admin() then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  update public.feedback
    set status = p_status,
        antwort = left(btrim(coalesce(p_antwort, '')), 2000),
        beantwortet_am = case when btrim(coalesce(p_antwort, '')) <> '' and btrim(coalesce(p_antwort, '')) <> antwort then now() else beantwortet_am end
    where id = p_id;
  if not found then
    raise exception 'FEEDBACK_UNBEKANNT';
  end if;
end;
$$;

-- Anbieter: Übersicht mit Betriebsnamen.
create function public.feedback_uebersicht(p_tage integer default 90)
returns table (id uuid, restaurant text, wer text, art public.feedback_art, text text,
               status public.feedback_status, antwort text, erstellt_am timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ist_plattform_admin() then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  return query
    select f.id, r.name, f.wer, f.art, f.text, f.status, f.antwort, f.erstellt_am
    from public.feedback f join public.restaurants r on r.id = f.restaurant_id
    where f.erstellt_am > now() - make_interval(days => least(greatest(p_tage, 1), 3650))
    order by f.erstellt_am desc
    limit 1000;
end;
$$;

-- Ist ein Claude-API-Schlüssel hinterlegt? Verrät nur ja oder nein.
create function public.ki_bereit() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v boolean;
begin
  if not public.ist_plattform_admin() and auth.uid() is not null then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  execute 'select exists (select 1 from vault.decrypted_secrets where name = ''anthropic_api_key'' and decrypted_secret <> '''')' into v;
  return v;
exception when undefined_table or invalid_schema_name then
  return false;
end;
$$;

-- Erstellt den Bericht über die letzten 7 Tage. Mit Schlüssel geht die Anfrage an Claude,
-- die Antwort holt wochenberichte_abholen() ab, sobald sie da ist.
create function public.wochenbericht_erstellen() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_von timestamptz := now() - interval '7 days';
  v_bis timestamptz := now();
  v_anzahl integer;
  v_statistik jsonb;
  v_liste text;
  v_schluessel text;
  v_id uuid;
  v_anfrage bigint;
  v_prompt text;
begin
  if auth.uid() is not null and not public.ist_plattform_admin() then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;

  select count(*) into v_anzahl from public.feedback where erstellt_am between v_von and v_bis;
  select jsonb_build_object(
      'wunsch', count(*) filter (where art = 'wunsch'),
      'problem', count(*) filter (where art = 'problem'),
      'lob', count(*) filter (where art = 'lob'),
      'betriebe', count(distinct restaurant_id),
      'offen_gesamt', (select count(*) from public.feedback where status in ('neu', 'gelesen')))
    into v_statistik
    from public.feedback where erstellt_am between v_von and v_bis;

  -- Betriebe nur als Nummern, Personen gar nicht: die KI braucht keine Namen.
  select string_agg(format('- [%s] Betrieb %s: %s', f.art, b.nr, replace(f.text, E'\n', ' ')), E'\n' order by f.erstellt_am)
    into v_liste
    from public.feedback f
    join (select restaurant_id, row_number() over (order by min(erstellt_am)) as nr
          from public.feedback where erstellt_am between v_von and v_bis group by restaurant_id) b
      on b.restaurant_id = f.restaurant_id
    where f.erstellt_am between v_von and v_bis;

  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = ''anthropic_api_key''' into v_schluessel;
  exception when undefined_table or invalid_schema_name then
    v_schluessel := null;
  end;

  if v_anzahl = 0 or coalesce(v_schluessel, '') = '' then
    insert into public.wochenberichte (von, bis, anzahl, statistik, status)
      values (v_von, v_bis, v_anzahl, v_statistik, 'ohne_ki') returning id into v_id;
    return v_id;
  end if;

  v_prompt := 'Du bist Produktberater für eine Reservierungs- und Gästesoftware für Restaurants und Hotelrestaurants. '
    || 'Hier sind die Rückmeldungen der zahlenden Betriebe aus den letzten 7 Tagen. '
    || 'Schreibe auf Deutsch einen kurzen Wochenbericht für den Gründer, ohne Einleitung, mit diesen Abschnitten: '
    || '"Das Wichtigste in drei Sätzen", "Häufigste Wünsche" (gruppiert, mit Anzahl der Betriebe), '
    || '"Probleme, die dringend sind", "Was gut ankommt" und "Empfehlung: die nächsten drei Schritte". '
    || 'Erfinde nichts, was nicht in den Rückmeldungen steht. Schlichte Sprache, höchstens 350 Wörter.'
    || E'\n\nRückmeldungen:\n' || left(v_liste, 60000);

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
    into v_anfrage
    using 'https://api.anthropic.com/v1/messages',
          jsonb_build_object('model', 'claude-sonnet-5-5', 'max_tokens', 1500,
                             'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', v_prompt))),
          jsonb_build_object('x-api-key', v_schluessel, 'anthropic-version', '2023-06-01', 'content-type', 'application/json');

  insert into public.wochenberichte (von, bis, anzahl, statistik, status, anfrage_id)
    values (v_von, v_bis, v_anzahl, v_statistik, 'wartet', v_anfrage) returning id into v_id;
  return v_id;
end;
$$;

-- Holt fertige Antworten von Claude ab. Läuft jede Minute.
create function public.wochenberichte_abholen() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  b record;
  v_code integer;
  v_inhalt text;
  v_fehler text;
  v_anzahl integer := 0;
begin
  for b in select id, anfrage_id, erstellt_am from public.wochenberichte where status = 'wartet' loop
    begin
      execute 'select status_code, content, error_msg from net._http_response where id = $1'
        into v_code, v_inhalt, v_fehler using b.anfrage_id;
    exception when undefined_table or invalid_schema_name then
      v_code := null;
    end;
    if v_code = 200 then
      update public.wochenberichte
        set text = coalesce((v_inhalt::jsonb -> 'content' -> 0 ->> 'text'), ''), status = 'fertig'
        where id = b.id;
      v_anzahl := v_anzahl + 1;
    elsif v_code is not null or v_fehler is not null then
      update public.wochenberichte
        set text = 'Claude hat nicht geantwortet (' || coalesce(v_code::text, 'keine Verbindung') || '). '
                   || left(coalesce(v_inhalt::jsonb #>> '{error,message}', v_fehler, ''), 300),
            status = 'fehler'
        where id = b.id;
      v_anzahl := v_anzahl + 1;
    elsif b.erstellt_am < now() - interval '30 minutes' then
      update public.wochenberichte set text = 'Keine Antwort von Claude innerhalb von 30 Minuten.', status = 'fehler' where id = b.id;
    end if;
  end loop;
  return v_anzahl;
end;
$$;

revoke execute on function
  public.ist_plattform_admin(),
  public.feedback_senden(uuid, public.feedback_art, text),
  public.feedback_beantworten(uuid, public.feedback_status, text),
  public.feedback_uebersicht(integer),
  public.ki_bereit(),
  public.wochenbericht_erstellen(),
  public.wochenberichte_abholen()
  from public, anon, authenticated;
grant execute on function
  public.ist_plattform_admin(),
  public.feedback_senden(uuid, public.feedback_art, text),
  public.feedback_beantworten(uuid, public.feedback_status, text),
  public.feedback_uebersicht(integer),
  public.ki_bereit(),
  public.wochenbericht_erstellen()
  to authenticated;

-- Montags früh (UTC) den Bericht erstellen, jede Minute Antworten abholen.
do $$
begin
  perform cron.schedule('wochenbericht', '7 6 * * 1', 'select public.wochenbericht_erstellen()');
  perform cron.schedule('wochenberichte-abholen', '* * * * *', 'select public.wochenberichte_abholen()');
exception when others then
  raise notice 'pg_cron nicht verfügbar: %', sqlerrm;
end;
$$;
