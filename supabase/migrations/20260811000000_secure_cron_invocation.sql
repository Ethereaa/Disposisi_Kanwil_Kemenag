-- Vault-backed cron invocation.
--
-- The two agenda cron jobs previously carried an inline x-cron-secret value in
-- cron.job.command, seeded by 20260730111535_schedule_agenda_reminder_cron.sql.
-- This migration retrieves the active credential from Vault at execution time
-- instead of storing it in cron.job.command. The credential passes transiently
-- through pg_net request-queue storage while the HTTP request is being processed.
--
-- No current/active CRON secret is introduced by this migration.
--
-- The previously compromised credential REMAINS PRESENT in the historical
-- migration file and in Git history. This migration does not remove it, does
-- not rewrite history, and makes no claim that it has been purged. It is
-- retained for migration integrity: rewriting history would not retract a
-- value that has already been distributed, and would invalidate both every
-- existing clone and the applied-migration ledger. That credential is
-- considered permanently revoked once rotation is performed as a separate
-- operational step; this migration alone does not revoke it.
--
-- Scope note: this migration does not alter pg_net ACLs, the pg_net extension,
-- Vault contents, or any supabase_admin-owned object.

-- ---------------------------------------------------------------------------
-- 1. Private schema
-- ---------------------------------------------------------------------------
-- Not `public`: pg_default_acl grants EXECUTE on every new public-schema
-- function to anon and authenticated automatically. A function that reads a
-- secret must never inherit that default.
--
-- AUTHORIZATION postgres, and deliberately NOT "IF NOT EXISTS": production has
-- no `private` schema today. If one exists at deployment time, that is
-- unexplained drift and this migration must fail (42P06) rather than silently
-- adopt a schema whose ownership and ACLs it did not establish.
create schema private authorization postgres;

comment on schema private is
  'Server-side helpers not exposed via PostgREST. No role except postgres has USAGE.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;
grant usage on schema private to postgres;

-- ---------------------------------------------------------------------------
-- 2. Wrapper
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default) is deliberate and load-bearing:
--   * postgres already holds SELECT on vault.decrypted_secrets, so the cron
--     job works without elevation;
--   * anon and authenticated hold no privilege on vault, so even if EXECUTE
--     were somehow reached, the Vault read fails rather than succeeding on
--     borrowed authority.
-- SECURITY DEFINER here would convert a privilege bug into secret disclosure.
--
-- CREATE FUNCTION, not CREATE OR REPLACE: no such function exists in
-- production. If one exists at deployment time, fail (42723) rather than
-- overwrite a definition this migration did not author.
create function private.invoke_secure_cron(job_key text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cron_secret text;
  target_url  text;
  request_id  bigint;
begin
  -- 2a. Fixed allow-list. The caller supplies a key, never a URL, host,
  --     project ref, or secret name. There is no path by which a caller can
  --     redirect the secret to an attacker-controlled endpoint.
  target_url := case job_key
    when 'agenda' then
      'https://ogxkbabtljmapdrhhbqg.supabase.co/functions/v1/send-agenda-reminders'
    when 'surat-overdue' then
      'https://ogxkbabtljmapdrhhbqg.supabase.co/functions/v1/send-surat-overdue-reminders'
    else
      null
  end;

  if target_url is null then
    raise exception 'invoke_secure_cron: unknown job_key %', job_key
      using errcode = '22023';
  end if;

  -- 2b. Single-statement Vault read. INTO STRICT makes "exactly one row" a
  --     precondition enforced by plpgsql rather than by a separate COUNT,
  --     which removes the race between counting and reading.
  begin
    select s.decrypted_secret
      into strict cron_secret
    from vault.decrypted_secrets s
    where s.name = 'cron_secret';
  exception
    when no_data_found then
      raise exception 'invoke_secure_cron: vault secret "cron_secret" not found'
        using errcode = '28000';
    when too_many_rows then
      raise exception 'invoke_secure_cron: vault secret "cron_secret" is ambiguous'
        using errcode = '28000';
  end;

  -- 2c. Reject null, empty, and whitespace-only. No branch interpolates
  --     cron_secret: an exception string reaches the Postgres log and
  --     cron.job_run_details.return_message, both broader audiences than
  --     the header itself.
  if cron_secret is null then
    raise exception 'invoke_secure_cron: vault secret "cron_secret" is null'
      using errcode = '28000';
  end if;

  if pg_catalog.btrim(cron_secret) = '' then
    raise exception 'invoke_secure_cron: vault secret "cron_secret" is empty'
      using errcode = '28000';
  end if;

  -- 2d. Dispatch. Wrapped so an error raised inside pg_net cannot surface a
  --     DETAIL line containing the headers jsonb. Only sqlstate and job_key
  --     propagate.
  begin
    select net.http_post(
      url     := target_url,
      body    := '{}'::jsonb,
      headers := pg_catalog.jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', cron_secret
      )
    ) into request_id;
  exception when others then
    raise exception 'invoke_secure_cron: dispatch failed for job_key % (sqlstate %)',
      job_key, sqlstate using errcode = 'XX000';
  end;

  return request_id;
end;
$$;

comment on function private.invoke_secure_cron(text) is
  'Invokes a whitelisted Edge Function with x-cron-secret read from Vault at '
  'call time. SECURITY INVOKER by design. Callable only by postgres.';

-- ---------------------------------------------------------------------------
-- 3. Privileges
-- ---------------------------------------------------------------------------
-- A newly created function has proacl = NULL, which means PUBLIC holds EXECUTE
-- by owner-default. This REVOKE is mandatory, not decorative, and runs in the
-- same transaction as CREATE FUNCTION so no window exists.
revoke all on function private.invoke_secure_cron(text) from public;
revoke all on function private.invoke_secure_cron(text) from anon, authenticated, service_role;
grant execute on function private.invoke_secure_cron(text) to postgres;

-- ---------------------------------------------------------------------------
-- 4. Rescheduling — the two existing agenda jobs only
-- ---------------------------------------------------------------------------
-- cron.schedule() upserts on jobname, updating jobid 1 and 2 in place.
-- Schedules reproduced verbatim from the live cron.job rows.
-- surat-overdue-reminder-pagi is deliberately NOT scheduled; it remains
-- unscheduled exactly as today. Scheduling it is a separate decision.
select cron.schedule(
  'agenda-reminder-pagi',
  '30 22 * * *',
  $cron$select private.invoke_secure_cron('agenda')$cron$
);

select cron.schedule(
  'agenda-reminder-sore',
  '0 8 * * *',
  $cron$select private.invoke_secure_cron('agenda')$cron$
);
