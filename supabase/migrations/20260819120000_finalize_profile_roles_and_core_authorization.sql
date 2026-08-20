/*
# Finalize profile roles and core-table authorization (BIG ROOT #1, scope C1)

## Summary
Closes the authorization gap on the three core business tables. Today every
policy on agenda_pimpinan / surat_masuk / surat_keluar is `USING (true)` and
role-blind, so any bearer of an `authenticated` JWT can read, write and DELETE
every record — including four auth identities that have no `profiles` row and
that the application itself refuses to log in. This migration:

1. Normalizes `profiles.role` to the two values the application recognises.
2. Repairs the `profiles.role` schema (default / NOT NULL / CHECK).
3. Closes authenticated profile self-provisioning, which would otherwise let a
   blocked identity mint its own `profiles` row and walk straight back through
   the new active-profile gate.
4. Requires a matching `profiles` row for core SELECT / INSERT / UPDATE.
5. Requires exact `role = 'admin'` for core DELETE.

## Why the live policy names differ from this repository
Migration 20260730150000 is recorded as applied in the production ledger, but
its effects are ABSENT from the live catalog: production still carries the
pre-20260730150000 permissive DELETE policies, `profiles.role` is nullable with
default 'staff', and no CHECK constraint exists. The agenda_pimpinan and
profiles policies were additionally renamed out of band (dashboard), to names
that appear in no migration in this repository:

  live                              this repository
  --------------------------------  ---------------------------------
  agenda_pimpinan_select_all        family_select_agenda_pimpinan
  agenda_pimpinan_insert_all        family_insert_agenda_pimpinan
  agenda_pimpinan_update_all        family_update_agenda_pimpinan
  agenda_pimpinan_delete_all        family_delete_agenda_pimpinan
                                    admin_delete_agenda_pimpinan
  "Users can insert own profile"    insert_own_profile

The repository is therefore NOT a faithful description of live policy state,
and this migration is the reconciliation point. Every DROP below covers BOTH
the live name and every historical repository name for that table+command.
That redundancy is load-bearing, not tidiness: permissive policies are ORed
together, so a single surviving `USING (true)` policy would silently grant the
access this migration exists to remove, while the catalog looked repaired.

## Changes
- `public.profiles`: role normalization, DEFAULT 'staf', NOT NULL,
  CHECK (role IN ('admin','staf')); INSERT policy dropped and the INSERT
  privilege revoked from anon + authenticated.
- RLS policies on `public.agenda_pimpinan`, `public.surat_masuk`,
  `public.surat_keluar`: all twelve replaced.

Nothing else is touched. No GRANT or REVOKE on the three core tables, no
default ACLs, no function EXECUTE, no CRON/Vault, no auth schema, no
service_role change, and no reference to the anonymous Agenda Preview view.

## Security (RLS)
Predicates, applied to `authenticated` only:

  active profile  (SELECT EXISTS (SELECT 1 FROM public.profiles p
                                   WHERE p.id = auth.uid()))
  admin           (SELECT EXISTS (SELECT 1 FROM public.profiles p
                                   WHERE p.id = auth.uid()
                                     AND p.role = 'admin'))

Both are wrapped as a scalar sub-select so the planner evaluates them once per
statement (InitPlan) instead of once per row.

No SECURITY DEFINER helper is introduced, and none is needed. The predicate is
evaluated as the querying user; `authenticated` holds SELECT on `profiles`, and
`profiles`' surviving SELECT policy `USING (auth.uid() = id)` exposes exactly
the one row `EXISTS` needs. It cannot recurse: no policy on `profiles` queries
`profiles`, so the chain terminates in one step. `profiles` also has
relforcerowsecurity = false, so the table owner remains exempt.

Resulting access for authenticated callers:

                       SELECT  INSERT  UPDATE  DELETE
  role = 'admin'         yes     yes     yes     yes
  role = 'staf'          yes     yes     yes     NO
  no profiles row        NO      NO      NO      NO

`anon` is unaffected: it is named by no policy here, and Migration
20260819000000 already removed every privilege it held on agenda_pimpinan.
`service_role` and `postgres` carry rolbypassrls = true, so RLS is never
evaluated for them — the reminder Edge Functions and all owner workflows are
untouched by every statement below.

## Notes
1. The `_all` suffix on the three retained agenda_pimpinan policy names is now
   historical: they are no longer "all". The names are kept deliberately, per
   the approved plan, so the live catalog name stays stable across this change
   rather than adding three more entries to the name-divergence set above.
2. The role normalization UPDATE is not blocked by
   `trg_enforce_profile_role_change`. That trigger's guard reads `auth.uid()`,
   which is NULL outside a PostgREST request (verified against production), so
   it short-circuits at `IF caller IS NULL THEN RETURN NEW`. No trigger is
   disabled, and none needs to be.
3. Both guard blocks run before the first mutating statement, so an abort
   leaves the database untouched regardless of transaction wrapping.
4. The historical "backfill every existing user to admin" step from
   20260730150000 is deliberately NOT reproduced. Run after normalization it
   would match all three staf rows and produce four admins, defeating this
   migration while appearing to have applied cleanly.
5. That backfill is also why guard 1b asserts EXACTLY one admin rather than at
   least one. On a from-zero replay, 20260730150000 runs before this migration
   and promotes every profile; a `> 0` guard would accept the resulting
   all-admin state, normalization would find nothing to change, and this
   migration would report success while granting every user the DELETE right it
   exists to restrict. Asserting = 1 makes that case abort before any mutation
   instead. The abort is intentional: recovering from it is a review decision,
   not something this migration may resolve by promoting or demoting anyone.
6. This migration does not create, promote or remediate any account. The four
   profile-less auth identities are handled operationally, not here.
*/

-- ===========================================================================
-- 1. APPLY-TIME GUARDS — abort rather than guess. No mutation has run yet.
-- ===========================================================================
DO $$
DECLARE
  unexpected_count integer;
  admin_count      integer;
  rls_disabled_on  text;
BEGIN
  -- 1a. Any role value outside the three we know how to handle means the data
  --     has diverged from the audit. Normalizing it would be guessing, and the
  --     CHECK constraint added below would fail anyway. NULL is expected and
  --     handled by the normalization step; it is not "unexpected".
  SELECT count(*) INTO unexpected_count
    FROM public.profiles
   WHERE role IS NOT NULL
     AND role NOT IN ('admin', 'staf', 'staff');

  IF unexpected_count > 0 THEN
    RAISE EXCEPTION
      'ABORT: % profiles row(s) carry a role outside (admin, staf, staff). '
      'Manual review is required; this migration will not guess a mapping.',
      unexpected_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1b. EXACT cardinality guard: there must be exactly one admin.
  --
  --     Zero admins would leave nobody able to delete once DELETE becomes
  --     admin-only. More than one admin means the state is not the audited
  --     state this migration was designed against, and the most likely cause
  --     is specific and dangerous: on a from-zero replay, migration
  --     20260730150000 runs first and mass-promotes every existing profile to
  --     admin. A `> 0` guard would accept that all-admin state, normalization
  --     would find nothing to do, and the migration would report success while
  --     granting every user the DELETE right it exists to restrict — a silent
  --     security failure that looks like a clean apply.
  --
  --     Asserting = 1 converts that into a fail-closed abort. It is checked
  --     before any mutation, so an abort leaves the database untouched.
  SELECT count(*) INTO admin_count
    FROM public.profiles
   WHERE role = 'admin';

  IF admin_count <> 1 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 1 profiles row with role = ''admin'', found %. '
      'This migration installs admin-only DELETE and is designed against a '
      'single-admin state: 0 admins would leave nobody able to delete, and '
      'more than 1 indicates unreviewed drift or a from-zero replay in which '
      'migration 20260730150000 mass-promoted every profile to admin. This '
      'migration will not guess, and will not promote or demote any user. '
      'Manual review is required; re-run once exactly one admin remains.',
      admin_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1c. A policy set on a table with RLS switched off is completely inert.
  --     Given the out-of-band drift documented in the header, assert rather
  --     than assume.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO rls_disabled_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('profiles', 'agenda_pimpinan', 'surat_masuk', 'surat_keluar')
     AND c.relkind = 'r'
     AND c.relrowsecurity = false;

  IF rls_disabled_on IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORT: row level security is DISABLED on: %. Every policy below would '
      'be inert. Enable RLS on those tables first.', rls_disabled_on
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- ===========================================================================
-- 2. NORMALIZE profiles.role
--    'admin' stays 'admin'. 'staff' and NULL both become 'staf'.
--    NULL is included so the migration stays correct if a row appears between
--    the audit and the apply.
-- ===========================================================================
UPDATE public.profiles
   SET role = 'staf'
 WHERE role IS NULL
    OR role = 'staff';

-- ===========================================================================
-- 3. REPAIR THE profiles.role SCHEMA
--    Live state before this migration: text, NULLABLE, DEFAULT 'staff'::text,
--    no CHECK constraint. The 'staff' default is why an INSERT that omitted
--    role was classified as a role change by trg_enforce_profile_role_change.
--    Order matters: normalize (section 2) before NOT NULL and before CHECK.
-- ===========================================================================
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staf';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staf'));

-- ===========================================================================
-- 4. CLOSE AUTHENTICATED PROFILE SELF-PROVISIONING
--
--    "Users can insert own profile" WITH CHECK (auth.uid() = id) let any JWT
--    holder create its own profiles row. trg_enforce_profile_role_change did
--    not stop it: its first branch returns before the authorization check when
--    NEW.role is not distinct from 'staf', so an INSERT explicitly passing
--    role = 'staf' succeeded. That is a complete bypass of the active-profile
--    gate added in section 5, which is why C1 closes it here.
--
--    Nothing legitimate calls it. Self-service registration was removed from
--    the application deliberately; there is no INSERT against profiles
--    anywhere in src/. handle_new_user() is SECURITY DEFINER owned by postgres,
--    so it inserts with the owner's privileges and never consults this policy
--    or the authenticated INSERT grant.
--
--    The REVOKE is defence in depth, and it is warranted specifically because
--    of the drift documented in the header: policies on this project have
--    demonstrably been recreated out of band. A dashboard edit can re-add a
--    permissive INSERT policy; it cannot re-grant a revoked privilege. Both
--    barriers must fall for the bypass to return.
--
--    SELECT and UPDATE are deliberately left alone — the active-profile
--    predicate needs SELECT, and updateUsername() needs UPDATE.
-- ===========================================================================
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;  -- live name
DROP POLICY IF EXISTS "insert_own_profile"           ON public.profiles;  -- 20260728124412

REVOKE INSERT ON TABLE public.profiles FROM anon, authenticated;

-- ===========================================================================
-- 5. CORE TABLE POLICIES
--
--    Per table: drop every name that has ever applied to the command (live,
--    historical, and the new name for idempotency), then create exactly one.
--    SELECT/INSERT/UPDATE keep their live names; DELETE moves to admin_*.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 5a. public.agenda_pimpinan
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "agenda_pimpinan_select_all"    ON public.agenda_pimpinan;  -- live
DROP POLICY IF EXISTS "family_select_agenda_pimpinan" ON public.agenda_pimpinan;  -- 20260729120000
DROP POLICY IF EXISTS "agenda_pimpinan_insert_all"    ON public.agenda_pimpinan;  -- live
DROP POLICY IF EXISTS "family_insert_agenda_pimpinan" ON public.agenda_pimpinan;  -- 20260729120000
DROP POLICY IF EXISTS "agenda_pimpinan_update_all"    ON public.agenda_pimpinan;  -- live
DROP POLICY IF EXISTS "family_update_agenda_pimpinan" ON public.agenda_pimpinan;  -- 20260729120000
DROP POLICY IF EXISTS "agenda_pimpinan_delete_all"    ON public.agenda_pimpinan;  -- live
DROP POLICY IF EXISTS "family_delete_agenda_pimpinan" ON public.agenda_pimpinan;  -- 20260729120000
DROP POLICY IF EXISTS "admin_delete_agenda_pimpinan"  ON public.agenda_pimpinan;  -- 20260730150000 + new

CREATE POLICY "agenda_pimpinan_select_all"
  ON public.agenda_pimpinan FOR SELECT
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "agenda_pimpinan_insert_all"
  ON public.agenda_pimpinan FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "agenda_pimpinan_update_all"
  ON public.agenda_pimpinan FOR UPDATE
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  )
  WITH CHECK (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "admin_delete_agenda_pimpinan"
  ON public.agenda_pimpinan FOR DELETE
  TO authenticated
  USING (
    (SELECT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
     ))
  );

-- --------------------------------------------------------------------------
-- 5b. public.surat_masuk
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_select_surat_masuk" ON public.surat_masuk;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_masuk_select_all"    ON public.surat_masuk;  -- defensive, drift shape
DROP POLICY IF EXISTS "family_insert_surat_masuk" ON public.surat_masuk;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_masuk_insert_all"    ON public.surat_masuk;  -- defensive, drift shape
DROP POLICY IF EXISTS "family_update_surat_masuk" ON public.surat_masuk;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_masuk_update_all"    ON public.surat_masuk;  -- defensive, drift shape
DROP POLICY IF EXISTS "family_delete_surat_masuk" ON public.surat_masuk;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_masuk_delete_all"    ON public.surat_masuk;  -- defensive, drift shape
DROP POLICY IF EXISTS "admin_delete_surat_masuk"  ON public.surat_masuk;  -- 20260730150000 + new

CREATE POLICY "family_select_surat_masuk"
  ON public.surat_masuk FOR SELECT
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "family_insert_surat_masuk"
  ON public.surat_masuk FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "family_update_surat_masuk"
  ON public.surat_masuk FOR UPDATE
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  )
  WITH CHECK (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "admin_delete_surat_masuk"
  ON public.surat_masuk FOR DELETE
  TO authenticated
  USING (
    (SELECT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
     ))
  );

-- --------------------------------------------------------------------------
-- 5c. public.surat_keluar
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_select_surat_keluar" ON public.surat_keluar;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_keluar_select_all"    ON public.surat_keluar;  -- defensive, drift shape
DROP POLICY IF EXISTS "family_insert_surat_keluar" ON public.surat_keluar;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_keluar_insert_all"    ON public.surat_keluar;  -- defensive, drift shape
DROP POLICY IF EXISTS "family_update_surat_keluar" ON public.surat_keluar;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_keluar_update_all"    ON public.surat_keluar;  -- defensive, drift shape
DROP POLICY IF EXISTS "family_delete_surat_keluar" ON public.surat_keluar;  -- live + 20260728114553
DROP POLICY IF EXISTS "surat_keluar_delete_all"    ON public.surat_keluar;  -- defensive, drift shape
DROP POLICY IF EXISTS "admin_delete_surat_keluar"  ON public.surat_keluar;  -- 20260730150000 + new

CREATE POLICY "family_select_surat_keluar"
  ON public.surat_keluar FOR SELECT
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "family_insert_surat_keluar"
  ON public.surat_keluar FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "family_update_surat_keluar"
  ON public.surat_keluar FOR UPDATE
  TO authenticated
  USING (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  )
  WITH CHECK (
    (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

CREATE POLICY "admin_delete_surat_keluar"
  ON public.surat_keluar FOR DELETE
  TO authenticated
  USING (
    (SELECT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
     ))
  );

-- ===========================================================================
-- 6. POST-FLIGHT ASSERTIONS
--
--    The failure mode this repair is most exposed to is a surviving permissive
--    policy: they are ORed together, so one leftover `USING (true)` would
--    restore the access removed above while the catalog looked repaired.
--    Verify the end state in the same transaction and roll back if wrong.
-- ===========================================================================
DO $$
DECLARE
  core_policy_count integer;
  duplicated        text;
  ungated           text;
  wrong_role        text;
  admin_count       integer;
BEGIN
  SELECT count(*) INTO core_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('agenda_pimpinan', 'surat_masuk', 'surat_keluar');

  IF core_policy_count <> 12 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 12 policies across the three core tables, found %.',
      core_policy_count;
  END IF;

  -- Exactly one policy per table+command, and no cmd = 'ALL' policy hiding
  -- behind the count.
  SELECT string_agg(format('%s.%s=%s', tablename, cmd, n), ', ' ORDER BY tablename, cmd)
    INTO duplicated
    FROM (
      SELECT tablename, cmd, count(*) AS n
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('agenda_pimpinan', 'surat_masuk', 'surat_keluar')
       GROUP BY tablename, cmd
    ) s
   WHERE n <> 1
      OR cmd NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORT: unexpected policy shape on core tables (%). Permissive policies '
      'are ORed together, so a leftover policy would defeat this repair.',
      duplicated;
  END IF;

  -- Every core policy must actually be gated on profiles.
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO ungated
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('agenda_pimpinan', 'surat_masuk', 'surat_keluar')
     AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%profiles%';

  IF ungated IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: core policy is not gated on profiles: %.', ungated;
  END IF;

  -- Every core policy must apply to authenticated only.
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO wrong_role
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('agenda_pimpinan', 'surat_masuk', 'surat_keluar')
     AND roles <> ARRAY['authenticated']::name[];

  IF wrong_role IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: core policy is not scoped TO authenticated: %.', wrong_role;
  END IF;

  -- profiles: self-provisioning must be closed at both layers.
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'profiles'
                AND cmd IN ('INSERT', 'ALL')) THEN
    RAISE EXCEPTION 'ABORT: an INSERT-capable policy still exists on public.profiles.';
  END IF;

  IF has_table_privilege('anon', 'public.profiles', 'INSERT')
     OR has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'ABORT: anon or authenticated still holds INSERT on public.profiles.';
  END IF;

  -- profiles: the predicate's own prerequisites must survive.
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost SELECT on public.profiles; every core policy would deny.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost UPDATE on public.profiles; updateUsername would break.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: public.profiles has no SELECT policy; every core policy would deny.';
  END IF;

  -- role column end state.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role NOT IN ('admin', 'staf')) THEN
    RAISE EXCEPTION 'ABORT: profiles.role still holds a value outside (admin, staf).';
  END IF;

  -- Exactly one admin must remain — the same cardinality guard 1b asserted,
  -- re-checked against the post-normalization state. Guard 1b proves the input
  -- was single-admin; this proves nothing in sections 2 and 3 changed that. A
  -- second admin appearing here would mean normalization or the CHECK repair
  -- promoted somebody, which nothing above is permitted to do.
  SELECT count(*) INTO admin_count
    FROM public.profiles
   WHERE role = 'admin';

  IF admin_count <> 1 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 1 admin profile after repair, found %. DELETE '
      'is now admin-only: 0 would make deletion unreachable, and more than 1 '
      'would grant it more widely than the audited state this migration was '
      'designed against.', admin_count;
  END IF;

  -- Fix 3 invariant: anon must still hold nothing on the agenda base table.
  -- Deliberately asserted against the base table only; this migration does not
  -- reference the anonymous preview view at all.
  IF has_table_privilege('anon', 'public.agenda_pimpinan', 'SELECT')
     OR has_table_privilege('anon', 'public.agenda_pimpinan', 'INSERT')
     OR has_table_privilege('anon', 'public.agenda_pimpinan', 'UPDATE')
     OR has_table_privilege('anon', 'public.agenda_pimpinan', 'DELETE') THEN
    RAISE EXCEPTION
      'ABORT: anon holds a privilege on public.agenda_pimpinan; migration '
      '20260819000000''s invariant is broken.';
  END IF;

  -- service_role must remain unaffected on every table this migration touched.
  IF NOT (has_table_privilege('service_role', 'public.profiles',        'INSERT')
      AND has_table_privilege('service_role', 'public.agenda_pimpinan', 'DELETE')
      AND has_table_privilege('service_role', 'public.surat_masuk',     'DELETE')
      AND has_table_privilege('service_role', 'public.surat_keluar',    'DELETE')) THEN
    RAISE EXCEPTION 'ABORT: service_role privileges changed; Edge Functions would break.';
  END IF;
END
$$;
