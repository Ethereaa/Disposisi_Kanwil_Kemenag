/*
# Harden app_settings authorization

## Why
`app_settings` is the office-wide key/value table (see migration
20260803000100), currently holding the single `surat_overdue_threshold_days`
value that drives the "terlambat" badges on Dashboard and Surat Masuk and the
overdue-reminder push threshold.

Phase 3D (audit) found two gaps:

1. All three policies are `TO authenticated` with predicates literally `true`,
   so ANY authenticated identity — including one with no `profiles` row —
   could SELECT and WRITE every office-wide value. The only partial mitigation
   was client-side: `getCurrentUser()` signs out when no profile exists, which
   protects the UI but not the API.
2. RLS does not apply to TRUNCATE, and the `anon` and `authenticated` roles
   hold the full table ACL (`arwdDxtm`, including TRUNCATE) granted by
   20260803000100. An `authenticated` identity could `TRUNCATE` the table no
   matter what the row policies say.

The final authorization model (approved business decision):

  admin                   SELECT/INSERT/UPDATE yes, DELETE/TRUNCATE no
  staf                    SELECT only
  authenticated w/o profile  nothing
  anon                    nothing
  service_role            unchanged — rolbypassrls = true, policies never apply

This mirrors the active-profile / admin predicate shape already live on the
three core tables since migration 20260819120000: identical inline EXISTS
predicates, no SECURITY DEFINER helper, no new helper function at all.

## Frontend ordering
The Settings page admin write gate (`canManageThreshold = user?.role === 'admin'`)
was shipped to production BEFORE this migration was applied. A staf who still
had the old bundle for a moment would get a clean 403 from the INSERT policy
path — loud, not silent.

## Scope
`public.app_settings` ONLY: three policy replacements + table privileges.
`public.profiles` is referenced inside predicates but never altered. No other
table, no storage, no auth, no cron/vault, no push_subscriptions, no function
EXECUTE, no default ACLs.

## Fail-closed guards
The DO blocks below assert the expected pre-state and the expected post-state;
a mismatch aborts inside the migration's transaction and rolls everything back
(including the ledger insert — `supabase db push` wraps each migration).
*/

-- ----------------------------------------------------------------------------
-- Step 1. Assert the pre-state this migration was designed against.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.app_settings) <> 1 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 1 app_settings row, found %. Reconcile '
      'before hardening authorization.', (SELECT count(*) FROM public.app_settings);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'app_settings'
       AND qual = 'true'
  ) THEN
    RAISE EXCEPTION
      'ABORT: the old permissive app_settings policies are not all present. '
      'Reconcile the live policy state before hardening.';
  END IF;

  IF NOT (
    has_table_privilege('anon', 'public.app_settings', 'SELECT')
    AND has_table_privilege('anon', 'public.app_settings', 'TRUNCATE')
    AND has_table_privilege('authenticated', 'public.app_settings', 'TRUNCATE')
  ) THEN
    RAISE EXCEPTION
      'ABORT: expected the broad pre-repair app_settings ACL (anon and '
      'authenticated holding SELECT + TRUNCATE). Reconcile before hardening.';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Step 2. Table privileges. RLS does not protect TRUNCATE, so this repair
-- hardens BOTH the policies and the ACL. anon keeps nothing; authenticated
-- keeps exactly SELECT/INSERT/UPDATE (needed for the admin upsert); DELETE,
-- TRUNCATE, REFERENCES and TRIGGER are removed with the full REVOKE.
-- service_role and postgres are untouched.
-- ----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.app_settings FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.app_settings TO authenticated;

-- ----------------------------------------------------------------------------
-- Step 3. Policies — exactly three, no DELETE policy, same predicate shape as
-- the core tables (scalar sub-select, evaluated once per statement).
-- SELECT: any authenticated identity WITH a profiles row.
-- INSERT/UPDATE: authenticated WITH an admin profile.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS shared_select_app_settings ON public.app_settings;
CREATE POLICY shared_select_app_settings
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

DROP POLICY IF EXISTS shared_upsert_app_settings ON public.app_settings;
CREATE POLICY shared_upsert_app_settings
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
     ))
  );

DROP POLICY IF EXISTS shared_update_app_settings ON public.app_settings;
CREATE POLICY shared_update_app_settings
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (
    (SELECT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
     ))
  )
  WITH CHECK (
    (SELECT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
     ))
  );

-- No DELETE policy: DELETE is denied for every non-bypassing role.

-- ----------------------------------------------------------------------------
-- Step 4. Assert the final state. Any drift aborts the migration.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_sans boolean;
  v_ins  boolean;
  v_upd  boolean;
  v_del  boolean;
  v_trunc boolean;
BEGIN
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'app_settings') <> 3 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 3 app_settings policies after hardening, found %.',
      (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='app_settings');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'app_settings'
       AND (qual = 'true' OR with_check = 'true' OR cmd = 'DELETE')
  ) THEN
    RAISE EXCEPTION
      'ABORT: a permissive or DELETE policy survived on app_settings.';
  END IF;

  SELECT has_table_privilege('anon', 'public.app_settings', 'SELECT') INTO v_sans;
  IF v_sans THEN
    RAISE EXCEPTION 'ABORT: anon still holds SELECT on app_settings.';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.app_settings', 'INSERT') INTO v_ins;
  SELECT has_table_privilege('authenticated', 'public.app_settings', 'UPDATE') INTO v_upd;
  SELECT has_table_privilege('authenticated', 'public.app_settings', 'DELETE') INTO v_del;
  SELECT has_table_privilege('authenticated', 'public.app_settings', 'TRUNCATE') INTO v_trunc;
  IF NOT (v_ins AND v_upd) OR (v_del OR v_trunc) THEN
    RAISE EXCEPTION
      'ABORT: authenticated privileges are not exactly SELECT/INSERT/UPDATE '
      'on app_settings.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.app_settings', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: service_role lost SELECT on app_settings.';
  END IF;
END
$$;
