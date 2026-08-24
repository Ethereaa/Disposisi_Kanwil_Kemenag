/*
# Harden attachment storage authorization and revoke the dead WhatsApp bucket

## Why

### 1. Profile-less identities hold full access to live attachments (BLOCKER)
All four `lampiran-surat` policies (migration 20260731064145, re-applied from
20260731020000) are `TO authenticated` with the predicate

    bucket_id = 'lampiran-surat'

and nothing else. That predicate references neither `auth.uid()` nor
`public.profiles`, so it evaluates identically for EVERY bearer of a
`role=authenticated` JWT. There are zero RESTRICTIVE policies on
`storage.objects`, so nothing AND-s in an additional condition.

Since 20260819120000 (core tables) and 20260821040000 (`app_settings`), every
`public` policy requires a `profiles` row — 15 of 15. Storage was the only
surface left behind, which produced a real asymmetry: an authenticated identity
with no `profiles` row reads 0 core rows and cannot write anything, yet could
READ, UPLOAD, UPDATE and DELETE every attachment in the live bucket. Four such
identities exist in `auth.users` today, all with a confirmed email, a password,
no ban, and a prior successful sign-in — so the JWT is obtainable, not
hypothetical.

Attachments are scanned government correspondence. Read access alone is a
confidentiality breach; DELETE is unrecoverable data loss (Storage bytes are
not part of backup/restore, which carries `lampiran` jsonb metadata only).

The repair keeps the bucket scope and adds the same active-profile predicate
already live everywhere else. It deliberately does NOT gate on `admin`:
`family_update_*` on the three core tables is profile-holder, not admin-only,
so a staf editing a surat legitimately adds and removes attachments. Gating on
"has a profiles row" is the minimal change that closes the hole without
breaking the staf workflow.

Verified before writing this migration, against production, with the exact
predicate below and real subjects:

    admin (has profile)        -> true
    staf  (has profile)        -> true
    authenticated, no profile  -> false
    no JWT (auth.uid() IS NULL)-> false

`anon` is named by no storage policy at all and RLS is enabled on
`storage.objects`, so anon is already denied every verb — confirmed live
(LIST returns `[]`, bucket list returns `[]`, signing fails). This migration
does not grant anon anything, and adds no policy `TO anon` or `TO public`.

### 2. The dead WhatsApp bucket's policies (approved cleanup)
Bucket `lampiran` was created by 20260731053835 for the abandoned WhatsApp
upload experiment whose runtime was removed in commit d9141af. It holds
0 objects / 0 bytes, has 0 pending multipart uploads, and no row in any
`storage` table references it. Its consumer table `wa_pending_uploads` is
already dropped. The legacy `lampiran_url` / `lampiran_nama` columns hold 0
non-null values across all three tables, so nothing points into it. The only
references anywhere in the repository are inside its own creating migration.

Its three policies are the security-relevant part: a standing grant of SELECT,
INSERT and DELETE to every authenticated identity on a bucket nobody audits.
This migration drops them, which reduces that bucket's effective capability to
zero for `authenticated` and `anon` alike — RLS is enabled on `storage.objects`,
so a bucket with no policy is deny-all for every non-bypassing role.

The empty **bucket row itself** is deliberately NOT deleted here, and remains
in place. Postgres trigger `storage.protect_delete` on `storage.buckets`
rejects direct DML with `42501 Direct deletion from storage tables is not
allowed. Use the Storage API instead.` — a platform guard owned by
`supabase_storage_admin`, gated on the `storage.allow_delete_query` GUC.
Deleting the row is therefore a Storage API operation, which needs a
service-role key that is not available to this repository; the Management API
exposes no bucket-delete route and the CLI's `storage` command is object-level
only. Setting the bypass GUC to defeat a platform data-loss guard was rejected
as a workaround.

Dropping the policies is the security-complete half: with RLS enabled and no
policy naming the bucket, its capability is zero for every non-bypassing role,
and `public = false` means there is no unauthenticated URL path either. The
surviving row is an inert catalog entry carrying no grant. Removing it is
cosmetic and is recorded as backlog for an operator holding the service-role
key.

## Scope
`storage.objects` policies only. Nothing else: no `storage.buckets` row, no
`public` table, no core policy, no `app_settings`, no auth user, no `profiles`,
no role change, no cron/vault, no function EXECUTE, no default ACL, no Edge
Function, no `lampiran_url` / `lampiran_nama` column, and no object in
`lampiran-surat` — all 20 stay exactly where they are. Fix 3
(`agenda_pimpinan_public`) is untouched.

Table privileges are deliberately NOT changed here. Unlike `app_settings`,
`storage.objects` is owned by `supabase_storage_admin` and its ACL is platform
state that the Storage service itself depends on; the `anon`/`authenticated`
TRUNCATE grants on it are unreachable because PostgREST does not expose
`storage`, emits no TRUNCATE verb for any request, and no callable function in
`public` contains TRUNCATE (verified: 0). Recorded as backlog, not silently
skipped.

## Fail-closed guards
The DO blocks assert the expected pre-state and post-state. A mismatch raises
and rolls the whole migration back, ledger row included, because
`supabase db push` wraps each migration in a transaction.
*/

-- ----------------------------------------------------------------------------
-- Step 1. Assert the pre-state this migration was designed against.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_identity_free int;
  v_objects_surat int;
  v_objects_dead  int;
BEGIN
  -- 1a. The four lampiran-surat policies must still be the identity-free ones.
  SELECT count(*) INTO v_identity_free
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname IN (
       'family_select_lampiran_surat',
       'family_insert_lampiran_surat',
       'family_update_lampiran_surat',
       'family_delete_lampiran_surat'
     )
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
         NOT LIKE '%profiles%';

  IF v_identity_free <> 4 THEN
    RAISE EXCEPTION
      'ABORT: expected 4 identity-free lampiran-surat policies, found %. '
      'Live storage policy state has drifted; reconcile before hardening.',
      v_identity_free;
  END IF;

  -- 1b. The live attachments must be present and untouched by this migration.
  SELECT count(*) INTO v_objects_surat
    FROM storage.objects WHERE bucket_id = 'lampiran-surat';
  IF v_objects_surat = 0 THEN
    RAISE EXCEPTION
      'ABORT: bucket lampiran-surat reports 0 objects. That contradicts the '
      'audited state; refusing to touch attachment authorization blind.';
  END IF;

  -- 1c. The dead bucket must be genuinely empty before its policies are cut,
  -- so this migration cannot orphan reachable content.
  SELECT count(*) INTO v_objects_dead
    FROM storage.objects WHERE bucket_id = 'lampiran';
  IF v_objects_dead <> 0 THEN
    RAISE EXCEPTION
      'ABORT: bucket lampiran holds % object(s). It was audited as empty. '
      'Refusing to delete a bucket that now has content.', v_objects_dead;
  END IF;

  IF EXISTS (SELECT 1 FROM storage.s3_multipart_uploads WHERE bucket_id = 'lampiran')
     OR EXISTS (SELECT 1 FROM storage.s3_multipart_uploads_parts WHERE bucket_id = 'lampiran')
  THEN
    RAISE EXCEPTION
      'ABORT: bucket lampiran has pending multipart upload state.';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Step 2. Re-create the four lampiran-surat policies with the active-profile
-- predicate. Same bucket scope, same four verbs, same role — the ONLY change
-- is that the caller must now own a public.profiles row. Predicate shape is
-- the house style from 20260819120000: a scalar sub-select, so the EXISTS is
-- evaluated once per statement rather than once per row.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_select_lampiran_surat" ON storage.objects;
CREATE POLICY "family_select_lampiran_surat"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lampiran-surat'
    AND (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

DROP POLICY IF EXISTS "family_insert_lampiran_surat" ON storage.objects;
CREATE POLICY "family_insert_lampiran_surat"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lampiran-surat'
    AND (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

-- UPDATE keeps both arms: USING selects the visible row, WITH CHECK validates
-- the result, so an authorized caller cannot move an object out of the bucket.
DROP POLICY IF EXISTS "family_update_lampiran_surat" ON storage.objects;
CREATE POLICY "family_update_lampiran_surat"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'lampiran-surat'
    AND (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'lampiran-surat'
    AND (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

-- DELETE stays profile-holder, not admin-only: core family_update_* is
-- profile-holder, so a staf editing a surat removes its own attachments via
-- deleteAttachment() in src/lib/attachments.ts.
DROP POLICY IF EXISTS "family_delete_lampiran_surat" ON storage.objects;
CREATE POLICY "family_delete_lampiran_surat"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'lampiran-surat'
    AND (SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- Step 3. Retire the dead WhatsApp bucket's policies. With RLS enabled and no
-- policy naming any role, bucket `lampiran` becomes deny-all for authenticated
-- and anon alike. The empty bucket ROW is intentionally left in place:
-- storage.protect_delete rejects direct DML on storage.buckets, and no
-- service-role credential is available for the Storage API. See ## Why.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "lampiran_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "lampiran_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "lampiran_delete_authenticated" ON storage.objects;

-- ----------------------------------------------------------------------------
-- Step 4. Assert the final state. Any drift aborts and rolls back.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_total       int;
  v_with_prof   int;
  v_anon_named  int;
  v_dead_pols   int;
  v_dead_bucket int;
  v_objects     int;
BEGIN
  -- 4a. Exactly the four lampiran-surat policies remain on storage.objects.
  SELECT count(*) INTO v_total
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
  IF v_total <> 4 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 4 storage.objects policies after cleanup, found %.',
      v_total;
  END IF;

  -- 4b. Every one of them now requires a profiles row AND pins the bucket.
  SELECT count(*) INTO v_with_prof
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%profiles%'
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%lampiran-surat%';
  IF v_with_prof <> 4 THEN
    RAISE EXCEPTION
      'ABORT: only % of 4 storage policies carry the active-profile predicate.',
      v_with_prof;
  END IF;

  -- 4c. No policy may name anon or public, and none may be permissive-true.
  SELECT count(*) INTO v_anon_named
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (roles::text LIKE '%anon%' OR roles::text LIKE '%public%'
          OR qual = 'true' OR with_check = 'true');
  IF v_anon_named <> 0 THEN
    RAISE EXCEPTION
      'ABORT: a storage policy names anon/public or is literally true.';
  END IF;

  -- 4d. The dead bucket's policies are gone, so that bucket is now deny-all.
  SELECT count(*) INTO v_dead_pols
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'lampiran\_%';
  IF v_dead_pols <> 0 THEN
    RAISE EXCEPTION 'ABORT: % dead lampiran_* policy/policies survived.', v_dead_pols;
  END IF;

  -- The bucket row itself is expected to REMAIN: storage.protect_delete blocks
  -- direct DML and no service-role key is available for the Storage API. It is
  -- inert either way now that no policy grants access to it. Assert only that
  -- it is still empty, so nothing reachable was orphaned.
  SELECT count(*) INTO v_dead_bucket
    FROM storage.objects WHERE bucket_id = 'lampiran';
  IF v_dead_bucket <> 0 THEN
    RAISE EXCEPTION 'ABORT: bucket lampiran unexpectedly holds objects.';
  END IF;

  -- 4e. The live bucket and all its objects are untouched.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'lampiran-surat' AND public = false) THEN
    RAISE EXCEPTION
      'ABORT: bucket lampiran-surat is missing or is no longer private.';
  END IF;

  SELECT count(*) INTO v_objects
    FROM storage.objects WHERE bucket_id = 'lampiran-surat';
  IF v_objects = 0 THEN
    RAISE EXCEPTION 'ABORT: attachments disappeared from lampiran-surat.';
  END IF;

  -- 4f. RLS must still be enabled, or every predicate above is decorative.
  IF NOT (SELECT c.relrowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'storage' AND c.relname = 'objects') THEN
    RAISE EXCEPTION 'ABORT: RLS is not enabled on storage.objects.';
  END IF;
END
$$;
