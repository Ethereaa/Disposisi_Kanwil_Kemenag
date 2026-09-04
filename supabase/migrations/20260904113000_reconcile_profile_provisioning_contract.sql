-- Root 5D.4
-- Reconcile profiles schema and auth -> profile provisioning with the
-- application's current login-only / admin-provisioned account model.
--
-- This migration deliberately accepts BOTH known pre-migration states:
--
--   A. Audited production drift:
--      - profiles.full_name exists but contains no data
--      - profiles.id has no default
--      - profiles.email / created_at are nullable
--      - handle_new_user() contains the live fail-open exception blanket
--
--   B. Clean replay of tracked migrations:
--      - profiles.full_name does not exist
--      - profiles.id still defaults to auth.uid()
--      - profiles.email / created_at are already NOT NULL
--      - handle_new_user() is the original tracked fail-closed definition
--
-- Both states converge to the same final contract.
--
-- Historical auth.users rows without profiles are intentionally NOT backfilled
-- or deleted here. They remain fail-closed pending separate provenance review.

begin;

do $$
declare
  required_column_count integer;
  full_name_exists boolean;
  full_name_non_null_count integer := 0;

  id_default text;
  id_nullable text;
  email_nullable text;
  created_at_nullable text;
  created_at_default text;
  profile_null_count integer;

  trigger_definition text;

  function_source text;
  function_source_normalized text;
  function_security_definer boolean;
  function_owner text;
  function_config text[];

  function_is_live_fail_open boolean;
  function_is_repo_baseline boolean;
begin
  -- =========================================================================
  -- 1. profiles schema/data preconditions
  -- =========================================================================

  select count(*)
    into required_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in ('id', 'email', 'created_at');

  if required_column_count <> 3 then
    raise exception
      'ABORT: expected profiles.id, profiles.email and profiles.created_at; found % required column(s).',
      required_column_count;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
  )
  into full_name_exists;

  -- On production this live-only drift column exists. On a clean repository
  -- replay it does not. If it exists, it must still be completely unused.
  if full_name_exists then
    execute
      'select count(*) from public.profiles where full_name is not null'
      into full_name_non_null_count;

    if full_name_non_null_count <> 0 then
      raise exception
        'ABORT: profiles.full_name contains % non-NULL row(s); migration will not discard data.',
        full_name_non_null_count;
    end if;
  end if;

  select column_default, is_nullable
    into id_default, id_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'id';

  if id_nullable is distinct from 'NO' then
    raise exception
      'ABORT: unexpected profiles.id nullability: %. Expected NO.',
      coalesce(id_nullable, '<missing>');
  end if;

  -- Accepted:
  --   production drift -> no id default
  --   clean replay      -> DEFAULT auth.uid()
  if id_default is not null
     and pg_catalog.regexp_replace(
           id_default,
           '[[:space:]"]',
           '',
           'g'
         ) <> 'auth.uid()'
  then
    raise exception
      'ABORT: unexpected profiles.id default: %.',
      id_default;
  end if;

  select is_nullable
    into email_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'email';

  select is_nullable, column_default
    into created_at_nullable, created_at_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'created_at';

  if email_nullable not in ('YES', 'NO') then
    raise exception
      'ABORT: unexpected profiles.email nullability: %.',
      coalesce(email_nullable, '<missing>');
  end if;

  if created_at_nullable not in ('YES', 'NO') then
    raise exception
      'ABORT: unexpected profiles.created_at nullability: %.',
      coalesce(created_at_nullable, '<missing>');
  end if;

  if created_at_default is null
     or pg_catalog.regexp_replace(
          created_at_default,
          '[[:space:]"]',
          '',
          'g'
        ) <> 'now()'
  then
    raise exception
      'ABORT: unexpected profiles.created_at default: %.',
      coalesce(created_at_default, '<missing>');
  end if;

  select count(*)
    into profile_null_count
  from public.profiles
  where email is null
     or created_at is null;

  if profile_null_count <> 0 then
    raise exception
      'ABORT: % profiles row(s) contain NULL email/created_at; manual repair required.',
      profile_null_count;
  end if;

  -- =========================================================================
  -- 2. auth.users trigger precondition
  -- =========================================================================

  select pg_get_triggerdef(t.oid, true)
    into trigger_definition
  from pg_trigger t
  where not t.tgisinternal
    and t.tgrelid = 'auth.users'::regclass
    and t.tgname = 'on_auth_user_created';

  if trigger_definition is distinct from
     'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()'
  then
    raise exception
      'ABORT: unexpected on_auth_user_created trigger definition: %',
      coalesce(trigger_definition, '<missing>');
  end if;

  -- =========================================================================
  -- 3. handle_new_user() precondition
  -- =========================================================================

  select
    p.prosrc,
    p.prosecdef,
    pg_get_userbyid(p.proowner),
    p.proconfig
    into
      function_source,
      function_security_definer,
      function_owner,
      function_config
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'handle_new_user'
    and p.prokind = 'f'
    and pg_get_function_identity_arguments(p.oid) = '';

  if function_source is null then
    raise exception
      'ABORT: public.handle_new_user() is missing';
  end if;

  if function_security_definer is distinct from true then
    raise exception
      'ABORT: public.handle_new_user() is unexpectedly not SECURITY DEFINER';
  end if;

  if function_owner is distinct from 'postgres' then
    raise exception
      'ABORT: unexpected handle_new_user() owner: %',
      coalesce(function_owner, '<missing>');
  end if;

  if function_config is null
     or not ('search_path=public' = any(function_config))
  then
    raise exception
      'ABORT: unexpected handle_new_user() configuration: %',
      coalesce(function_config::text, '<missing>');
  end if;

  function_source_normalized :=
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        function_source,
        '[[:space:]]+',
        ' ',
        'g'
      )
    );

  -- Known production drift.
  function_is_live_fail_open :=
       position('when others' in function_source_normalized) > 0
   and position(
         'raise log ''handle_new_user failed:'
         in function_source_normalized
       ) > 0;

  -- Known repository baseline.
  function_is_repo_baseline :=
       position('when others' in function_source_normalized) = 0
   and position(
         'insert into public.profiles'
         in function_source_normalized
       ) > 0
   and position(
         'where not exists'
         in function_source_normalized
       ) > 0
   and position(
         'on conflict (id) do nothing'
         in function_source_normalized
       ) > 0
   and position(
         'return new'
         in function_source_normalized
       ) > 0;

  if not function_is_live_fail_open
     and not function_is_repo_baseline
  then
    raise exception
      'ABORT: handle_new_user() matches neither audited production drift nor tracked repository baseline.';
  end if;

  -- Both known pre-states still expose EXECUTE through the historical default
  -- function privilege. If that has already changed, review the drift instead
  -- of blindly overwriting it.
  if not has_function_privilege(
      'anon',
      'public.handle_new_user()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.handle_new_user()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.handle_new_user()',
      'EXECUTE'
    )
  then
    raise exception
      'ABORT: handle_new_user() EXECUTE privilege state no longer matches either audited pre-state.';
  end if;
end
$$;

-- ===========================================================================
-- 4. profiles schema reconciliation
-- ===========================================================================

-- Production drift has this empty column. A clean migration replay does not.
-- No CASCADE: any unexpected dependency must stop the migration.
alter table public.profiles
  drop column if exists full_name;

-- Self-service profile INSERT has been removed from the application and
-- INSERT privilege is already revoked from client roles. Internal provisioning
-- supplies auth.users.id explicitly.
alter table public.profiles
  alter column id drop default;

alter table public.profiles
  alter column email set not null;

alter table public.profiles
  alter column created_at set not null;

-- ===========================================================================
-- 5. fail-closed auth -> profile provisioning
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_username text;
  fallback_username text;
  final_username text;
  uuid_suffix text;
begin
  if NEW.id is null then
    raise exception
      'Profile provisioning failed: auth user id is NULL'
      using errcode = '23502';
  end if;

  if NEW.email is null or pg_catalog.btrim(NEW.email) = '' then
    raise exception
      'Profile provisioning failed: email is required'
      using errcode = '23502';
  end if;

  requested_username :=
    nullif(
      pg_catalog.btrim(NEW.raw_user_meta_data->>'username'),
      ''
    );

  uuid_suffix :=
    pg_catalog.left(
      pg_catalog.replace(NEW.id::text, '-', ''),
      8
    );

  if requested_username is not null then
    -- An explicitly supplied username is preserved after outer trim.
    -- A duplicate must abort provisioning rather than silently renaming it.
    final_username := requested_username;

    if exists (
      select 1
      from public.profiles p
      where p.username = final_username
    ) then
      raise exception
        'Profile provisioning failed: requested username already exists'
        using errcode = '23505';
    end if;
  else
    fallback_username :=
      nullif(
        pg_catalog.btrim(
          pg_catalog.split_part(NEW.email, '@', 1)
        ),
        ''
      );

    if fallback_username is null then
      fallback_username := 'user';
    end if;

    final_username := fallback_username;

    if exists (
      select 1
      from public.profiles p
      where p.username = final_username
    ) then
      final_username :=
        fallback_username || '-' || uuid_suffix;
    end if;

    if exists (
      select 1
      from public.profiles p
      where p.username = final_username
    ) then
      raise exception
        'Profile provisioning failed: fallback username collision'
        using errcode = '23505';
    end if;
  end if;

  insert into public.profiles (
    id,
    username,
    email
  )
  values (
    NEW.id,
    final_username,
    pg_catalog.btrim(NEW.email)
  );

  return NEW;
end;
$$;

-- ===========================================================================
-- 6. function privilege hardening
-- ===========================================================================

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user()
  from anon, authenticated, service_role;

grant execute on function public.handle_new_user() to postgres;

-- ===========================================================================
-- 7. fail-closed postconditions
-- ===========================================================================

do $$
declare
  id_default text;
  id_nullable text;
  email_nullable text;
  created_at_nullable text;

  function_source text;
  function_config text[];
  function_security_definer boolean;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
  ) then
    raise exception
      'POSTCHECK: profiles.full_name still exists';
  end if;

  select column_default, is_nullable
    into id_default, id_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'id';

  select is_nullable
    into email_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'email';

  select is_nullable
    into created_at_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'created_at';

  if id_default is not null
     or id_nullable is distinct from 'NO'
     or email_nullable is distinct from 'NO'
     or created_at_nullable is distinct from 'NO'
  then
    raise exception
      'POSTCHECK: final profiles column contract is incorrect';
  end if;

  select
    p.prosrc,
    p.proconfig,
    p.prosecdef
    into
      function_source,
      function_config,
      function_security_definer
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'handle_new_user'
    and p.prokind = 'f'
    and pg_get_function_identity_arguments(p.oid) = '';

  if function_security_definer is distinct from true then
    raise exception
      'POSTCHECK: handle_new_user() lost SECURITY DEFINER';
  end if;

  if function_config is null
     or not ('search_path=pg_catalog, public' = any(function_config))
  then
    raise exception
      'POSTCHECK: unexpected handle_new_user() search_path: %',
      coalesce(function_config::text, '<missing>');
  end if;

  if position(
      'when others'
      in pg_catalog.lower(function_source)
    ) > 0
  then
    raise exception
      'POSTCHECK: fail-open WHEN OTHERS still exists in handle_new_user()';
  end if;

  if has_function_privilege(
      'anon',
      'public.handle_new_user()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.handle_new_user()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.handle_new_user()',
      'EXECUTE'
    )
  then
    raise exception
      'POSTCHECK: a client role still has EXECUTE on handle_new_user()';
  end if;

  if not has_function_privilege(
      'postgres',
      'public.handle_new_user()',
      'EXECUTE'
    )
  then
    raise exception
      'POSTCHECK: postgres cannot execute handle_new_user()';
  end if;
end
$$;

commit;
