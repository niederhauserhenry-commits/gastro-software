-- Schritt 2: Restaurants, Team, Rollen, Module
-- Dieses Skript einmal im Supabase SQL Editor ausführen.

create type public.rolle as enum ('inhaber', 'manager', 'mitarbeiter', 'azubi');

-- Ein Restaurant ist ein Mandant. Jede weitere Tabelle verweist darauf.
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  erstellt_am timestamptz not null default now()
);

-- Wer gehört zu welchem Restaurant, mit welcher Rolle.
create table public.mitglieder (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  anzeigename text not null check (char_length(btrim(anzeigename)) between 1 and 80),
  email text not null,
  rolle public.rolle not null,
  darf_reservieren boolean not null default false,
  erstellt_am timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index mitglieder_user_idx on public.mitglieder (user_id);

-- Welche Module ein Restaurant gebucht hat.
create table public.module_freischaltungen (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  modul text not null,
  aktiv boolean not null default true,
  primary key (restaurant_id, modul)
);

-- Hilfsfunktionen für die Zugriffsregeln ------------------------------------

create function public.ist_mitglied(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mitglieder
    where restaurant_id = p_restaurant and user_id = (select auth.uid())
  );
$$;

create function public.meine_rolle(p_restaurant uuid) returns public.rolle
language sql stable security definer set search_path = '' as $$
  select rolle from public.mitglieder
  where restaurant_id = p_restaurant and user_id = (select auth.uid());
$$;

-- Leitung = Inhaber oder Manager.
create function public.ist_leitung(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.meine_rolle(p_restaurant) in ('inhaber', 'manager'), false);
$$;

-- Leitung darf immer reservieren, alle anderen nur mit Freigabe.
create function public.darf_reservieren(p_restaurant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mitglieder
    where restaurant_id = p_restaurant and user_id = (select auth.uid())
      and (rolle in ('inhaber', 'manager') or darf_reservieren)
  );
$$;

-- Zugriffsregeln (Row Level Security) ---------------------------------------
-- Gelesen wird nur das eigene Restaurant. Geschrieben wird ausschließlich
-- über die Funktionen weiter unten, deshalb gibt es keine Schreibregeln.

alter table public.restaurants enable row level security;
alter table public.mitglieder enable row level security;
alter table public.module_freischaltungen enable row level security;

create policy restaurants_lesen on public.restaurants
  for select to authenticated using (public.ist_mitglied(id));

create policy mitglieder_lesen on public.mitglieder
  for select to authenticated using (public.ist_mitglied(restaurant_id));

create policy module_lesen on public.module_freischaltungen
  for select to authenticated using (public.ist_mitglied(restaurant_id));

revoke all on public.restaurants, public.mitglieder, public.module_freischaltungen from anon, authenticated;
grant select on public.restaurants, public.mitglieder, public.module_freischaltungen to authenticated;

-- Schreibfunktionen -----------------------------------------------------------

-- Neues Restaurant anlegen. Wer es anlegt, wird Inhaber.
create function public.restaurant_anlegen(p_name text, p_anzeigename text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NICHT_ANGEMELDET';
  end if;
  select email into v_email from auth.users where id = v_user;

  insert into public.restaurants (name) values (btrim(p_name)) returning id into v_id;
  insert into public.mitglieder (restaurant_id, user_id, anzeigename, email, rolle, darf_reservieren)
    values (v_id, v_user, btrim(p_anzeigename), coalesce(v_email, ''), 'inhaber', true);
  insert into public.module_freischaltungen (restaurant_id, modul)
    values (v_id, 'reservierungen'), (v_id, 'gaeste'), (v_id, 'warteliste'), (v_id, 'feedback');
  return v_id;
end;
$$;

-- Prüft, ob der Aufrufer die Zielrolle vergeben oder verändern darf:
-- Inhaber dürfen alles, Manager nur Mitarbeiter und Azubis.
create function public.darf_rolle_verwalten(p_restaurant uuid, p_rolle public.rolle) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.meine_rolle(p_restaurant)
    when 'inhaber' then true
    when 'manager' then p_rolle in ('mitarbeiter', 'azubi')
    else false
  end;
$$;

-- Bereits registrierte Person über ihre E-Mail ins Team holen.
create function public.mitglied_hinzufuegen(
  p_restaurant uuid, p_email text, p_anzeigename text,
  p_rolle public.rolle, p_darf_reservieren boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_email text;
begin
  if not public.darf_rolle_verwalten(p_restaurant, p_rolle) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  select id, email into v_user, v_email from auth.users
    where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'NUTZER_NICHT_GEFUNDEN';
  end if;
  if exists (select 1 from public.mitglieder where restaurant_id = p_restaurant and user_id = v_user) then
    raise exception 'SCHON_IM_TEAM';
  end if;
  insert into public.mitglieder (restaurant_id, user_id, anzeigename, email, rolle, darf_reservieren)
    values (p_restaurant, v_user, btrim(p_anzeigename), v_email, p_rolle, p_darf_reservieren);
end;
$$;

-- Rolle oder Reservierungsrecht eines Teammitglieds ändern.
create function public.mitglied_aendern(
  p_restaurant uuid, p_user uuid, p_rolle public.rolle, p_darf_reservieren boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_alt public.rolle;
begin
  -- Sperrt die Teamzeilen, damit zwei gleichzeitige Änderungen nicht
  -- gemeinsam den letzten Inhaber entfernen können.
  perform 1 from public.mitglieder where restaurant_id = p_restaurant for update;
  select rolle into v_alt from public.mitglieder
    where restaurant_id = p_restaurant and user_id = p_user;
  if v_alt is null then
    raise exception 'NUTZER_NICHT_GEFUNDEN';
  end if;
  if not public.darf_rolle_verwalten(p_restaurant, v_alt)
     or not public.darf_rolle_verwalten(p_restaurant, p_rolle) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if v_alt = 'inhaber' and p_rolle <> 'inhaber' and
     (select count(*) from public.mitglieder where restaurant_id = p_restaurant and rolle = 'inhaber') <= 1 then
    raise exception 'LETZTER_INHABER';
  end if;
  update public.mitglieder set rolle = p_rolle, darf_reservieren = p_darf_reservieren
    where restaurant_id = p_restaurant and user_id = p_user;
end;
$$;

-- Teammitglied entfernen.
create function public.mitglied_entfernen(p_restaurant uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_alt public.rolle;
begin
  perform 1 from public.mitglieder where restaurant_id = p_restaurant for update;
  select rolle into v_alt from public.mitglieder
    where restaurant_id = p_restaurant and user_id = p_user;
  if v_alt is null then
    raise exception 'NUTZER_NICHT_GEFUNDEN';
  end if;
  if not public.darf_rolle_verwalten(p_restaurant, v_alt) then
    raise exception 'KEINE_BERECHTIGUNG';
  end if;
  if v_alt = 'inhaber' and
     (select count(*) from public.mitglieder where restaurant_id = p_restaurant and rolle = 'inhaber') <= 1 then
    raise exception 'LETZTER_INHABER';
  end if;
  delete from public.mitglieder where restaurant_id = p_restaurant and user_id = p_user;
end;
$$;

-- Funktionen nur für angemeldete Nutzer.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.ist_mitglied(uuid), public.meine_rolle(uuid), public.ist_leitung(uuid),
  public.darf_reservieren(uuid), public.darf_rolle_verwalten(uuid, public.rolle),
  public.restaurant_anlegen(text, text),
  public.mitglied_hinzufuegen(uuid, text, text, public.rolle, boolean),
  public.mitglied_aendern(uuid, uuid, public.rolle, boolean),
  public.mitglied_entfernen(uuid, uuid)
  to authenticated;
