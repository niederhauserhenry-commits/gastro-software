-- Nur für lokale Tests: bildet das Nötigste von Supabase nach.
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
-- Supabase legt Erweiterungen im Schema "extensions" ab und hat es im Suchpfad.
create schema extensions;
grant usage on schema extensions to authenticated, anon;
alter database t set search_path = "$user", public, extensions;
