-- Retire the abandoned WhatsApp -> website attachment runtime.
--
-- BUSINESS DECISION: the WhatsApp attachment experiment is permanently retired.
-- This migration removes the database half of its runtime surface. The deployed
-- Edge Function `wa-webhook` is deleted separately, through the Functions API,
-- immediately BEFORE this migration is applied — see the ordering note below.
--
-- WHAT THE FEATURE WAS. Introduced by 20260731053819. The intended flow was:
--   1) the web form inserts a row here (status 'waiting') and renders a QR code
--      containing the row's token,
--   2) the operator scans it, WhatsApp opens, they send a photo with the token
--      as the caption,
--   3) `wa-webhook` receives the photo, converts it to PDF, uploads it, and
--      flips the row to status 'done' with the resulting URL,
--   4) the still-open form, listening on this table over Realtime, auto-attaches
--      the file.
--
-- WHY IT IS SAFE TO REMOVE. Steps 3 and 4 never existed. Verified against the
-- deployed bundle and against production catalogs immediately before this file
-- was written:
--
--   * The photo -> PDF -> upload -> UPDATE path exists in the deployed function
--     only as TODO comments. The WhatsApp credentials it needs were never set as
--     secrets, so the handler always takes its `if (!ACCESS_TOKEN)` early return
--     and answers "OK (secrets not configured yet)". Live probes return 403.
--   * The feature therefore never completed a single transaction:
--     row_count = 0, and its dedicated (now empty) bucket holds 0 objects.
--   * Nothing depends on this table: 0 inbound foreign keys, 0 outbound foreign
--     keys, 0 triggers, 0 database functions referencing it, 0 views referencing
--     it, 0 scheduled jobs referencing it, 0 database webhooks (this project has
--     no supabase_functions schema at all).
--   * The frontend contains no reference to it. The application's only Realtime
--     channel subscribes to two unrelated tables, so removing this table's
--     publication membership cancels no live subscription.
--   * No secret is dedicated to it: every deployed secret is shared with the
--     reminder functions, so none is removed here or elsewhere.
--
-- The live website attachment path is a DIFFERENT bucket, reached through
-- src/lib/attachments.ts, and is not referenced by this migration.
--
-- ORDERING REQUIREMENT — FUNCTION FIRST, TABLE SECOND.
--     delete `wa-webhook`  ->  THIS migration
-- The function holds a service-role client and, on the branch that is currently
-- unreachable, writes to this table. Deleting the function first means there is
-- no window in which a deployed writer outlives its table. The reverse order
-- would leave the function briefly able to fail against a missing relation.
-- Both reminder functions are untouched: they are deleted individually by slug,
-- never by a bulk deploy.
--
-- FAIL CLOSED, TWICE. Step 1 aborts if the table is missing or holds any row, so
-- this can never destroy data that arrived after the audit. Step 3 uses a plain
-- DROP TABLE with no CASCADE, so an unexpected dependent object aborts the
-- migration instead of being silently deleted with it.
--
-- SCOPE. Exactly one relation and one publication membership. No other table,
-- view, policy, privilege, function, role, bucket, stored file, scheduled job or
-- secret is read or written by the statements below. The table's own policy and
-- its three indexes need no separate statement: DROP TABLE removes them with it.
--
-- DELIBERATELY LEFT IN PLACE, tracked separately as cleanup remnants rather than
-- runtime: the empty WhatsApp-era attachment bucket, that bucket's three access
-- policies, and the always-null lampiran_url / lampiran_nama columns added to
-- the three main tables by 20260731053819. None of them is reachable code, and
-- none is required for this decommission to be complete.

-- 1. Fail closed on any row, and on the table being unexpectedly absent.
--
-- The audit recorded row_count = 0. If that is no longer true, someone re-opened
-- the feature or seeded data after the audit, and dropping the table would
-- destroy it. Abort instead and let a human decide.
DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.wa_pending_uploads') IS NULL THEN
    RAISE EXCEPTION
      'ABORT: public.wa_pending_uploads is already absent. This migration '
      'expects to be the statement that removes it; something else did. '
      'Reconcile the migration history before continuing.';
  END IF;

  SELECT count(*) INTO v_rows FROM public.wa_pending_uploads;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'ABORT: public.wa_pending_uploads contains % row(s), expected 0. The '
      'retired WhatsApp feature is not idle. Nothing has been dropped.', v_rows;
  END IF;
END
$$;

-- 2. Detach it from the Realtime publication, if it is still a member.
--
-- 20260731053819 added it with ALTER PUBLICATION ... ADD TABLE. Step 3 would
-- remove the membership implicitly, but detaching first makes the intent
-- versioned rather than incidental, and stops Realtime from tracking the
-- relation before it disappears. Guarded so a re-run, or a database where the
-- membership was already removed by hand, is not an error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_publication p
      JOIN pg_publication_rel pr ON pr.prpubid = p.oid
     WHERE p.pubname = 'supabase_realtime'
       AND pr.prrelid = 'public.wa_pending_uploads'::regclass
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.wa_pending_uploads;
    RAISE NOTICE 'Detached public.wa_pending_uploads from supabase_realtime.';
  ELSE
    RAISE NOTICE 'public.wa_pending_uploads was not a supabase_realtime member.';
  END IF;
END
$$;

-- 3. Drop the table.
--
-- Plain DROP TABLE. NOT CASCADE, and deliberately so: the audit found no
-- dependent object, so if one exists after all, the correct outcome is a failed
-- migration and a human review — not a silent deletion of something this
-- migration was never authorised to touch. Not IF EXISTS either: step 1 has
-- already proven the table is there, so a failure here is real information.
DROP TABLE public.wa_pending_uploads;

-- Those three steps are the entire migration.
--
-- Post-apply expectation, for whoever verifies this:
--
--   to_regclass('public.wa_pending_uploads')          NULL
--   supabase_realtime members                          no longer include it
--   public policy count                                22 -> 21 (its one policy)
--   deployed Edge Functions                            wa-webhook absent,
--                                                      both reminders ACTIVE
--   everything else                                    unchanged
