-- Fix 3, Migration 1 of 2 — introduce the restricted public read surface.
--
-- LIVE STATE, verified against production catalogs in Fix 3 Step 0:
-- policy "agenda_pimpinan_select_public" is TO anon USING (true), and anon's
-- privileges on public.agenda_pimpinan are NOT limited to SELECT. The live ACL
-- grants anon effectively ALL table privileges — INSERT, SELECT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN (arwdDxtm).
--
-- What holds the line today is RLS, not those grants. agenda_pimpinan has RLS
-- enabled and the only anon-facing policy is SELECT-only, so no anonymous DML
-- path currently succeeds: an anon INSERT/UPDATE/DELETE is refused for want of
-- a matching policy even though the table-level privilege is present. That is
-- one layer of defence sitting on top of grants that should never have existed.
-- Note that TRUNCATE is not subject to RLS at all; it is unreachable today only
-- because PostgREST exposes no TRUNCATE verb.
--
-- So there are two distinct problems:
--   1. COLUMN EXPOSURE. `SELECT *` as anon returns all 16 columns to anyone
--      holding the published anon key, including created_by_email (staff email
--      addresses), lampiran (attachment metadata and storage paths),
--      created_at/updated_at and entry_seq. The public preview needs 8 of them.
--      RLS cannot fix this: a row policy filters rows, never columns.
--   2. EXCESS BASE-TABLE PRIVILEGE on anon, as described above.
--
-- This migration addresses (1) only. It intentionally does NOT revoke any
-- base-table privilege and does NOT drop the anon SELECT policy. That is a
-- requirement, not an oversight: the frontend currently deployed in production
-- still reads public.agenda_pimpinan directly, so revoking anon's base-table
-- access here would break both public routes the instant it is applied.
--
-- Migration 2 addresses (2) — DROP POLICY "agenda_pimpinan_select_public" plus
-- REVOKE ALL ON public.agenda_pimpinan FROM anon — and may be applied only
-- AFTER the frontend that reads agenda_pimpinan_public has been deployed.
-- The order is load-bearing:
--     this migration  ->  frontend deploy  ->  Migration 2
--
-- The view itself is the opposite case: it must be locked down immediately, in
-- this same transaction. REVOKE ALL runs before SELECT is granted back, because
-- this project's live pg_default_acl would otherwise leave the new view born
-- with anon holding every privilege on it. See the REVOKE below.

-- The top-level WITH is load-bearing, not stylistic. See the COMMENT below:
-- it makes the view structurally non-automatically-updatable, so no accident
-- of privilege can turn it into a write path into agenda_pimpinan.
CREATE VIEW public.agenda_pimpinan_public AS
WITH src AS (
  SELECT
    id,
    nomor_urut,
    tanggal_kegiatan,
    waktu_kegiatan,
    nama_kegiatan,
    tempat_kegiatan,
    keterangan,
    disposisi_pegawai
  FROM public.agenda_pimpinan
)
SELECT
  id,
  nomor_urut,
  tanggal_kegiatan,
  waktu_kegiatan,
  nama_kegiatan,
  tempat_kegiatan,
  keterangan,
  disposisi_pegawai
FROM src;

-- MANDATORY, and it must run in the same transaction as CREATE VIEW.
--
-- This project has ALTER DEFAULT PRIVILEGES in force on schema public granting
-- arwdDxtm (INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
-- MAINTAIN) to anon, authenticated and service_role ON TABLES. In PostgreSQL,
-- "ON TABLES" default privileges cover views as well, so the view created
-- above is BORN with anon=arwdDxtm. Without this REVOKE, anon would leave this
-- migration holding more privilege than before, not less.
REVOKE ALL ON public.agenda_pimpinan_public FROM PUBLIC, anon, authenticated, service_role;

-- Read-only, and only for the two roles that can actually open the public
-- route. service_role is intentionally not granted anything: it bypasses RLS
-- and reads the base table directly, so the Edge Functions never need the view.
GRANT SELECT ON public.agenda_pimpinan_public TO anon, authenticated;

COMMENT ON VIEW public.agenda_pimpinan_public IS $comment$
Public read surface for Agenda Pimpinan. Backs the two routes that must work
without login: the preview list (/agenda-preview) and the single-agenda share
link (/agenda-preview/:id).

Exposes ONLY the 8 approved columns: id, nomor_urut, tanggal_kegiatan,
waktu_kegiatan, nama_kegiatan, tempat_kegiatan, keterangan, disposisi_pegawai.
Deliberately omits created_by_email, lampiran, created_at, updated_at and
entry_seq. Do not add columns here without a fresh privacy review — anything in
this view is world-readable via the published anon key.

The top-level WITH is intentional and must not be "simplified" away. A view is
automatically updatable only if (among other conditions) its definition has no
top-level WITH, DISTINCT, GROUP BY, HAVING, LIMIT or OFFSET. The CTE therefore
makes this view structurally read-only: INSERT/UPDATE/DELETE against it fail in
the rewriter with "cannot change a view" regardless of what privileges anyone
later grants, unless someone explicitly adds an INSTEAD OF trigger or a DO
INSTEAD rule. The CTE is inlined by the planner (single reference,
non-recursive, no side effects), so SELECT performance is unaffected.

security_invoker is deliberately NOT enabled. After Migration 2, anon has zero
privilege on public.agenda_pimpinan; a security_invoker view would then check
anon's own base-table rights and fail. Owner-rights evaluation is what lets the
public routes keep working while anon holds nothing on the base table. This is
safe only in combination with the two guards above: the 8-column projection and
structural non-updatability.

REVOKE ALL before GRANT SELECT is mandatory, not defensive tidiness. This
project's live pg_default_acl grants broad privileges to newly created views in
schema public, so a new view starts out with anon holding every privilege
including DELETE. Any future migration that recreates this view must repeat the
REVOKE ALL in the same transaction as the CREATE.

authenticated also receives SELECT because a logged-in user may open the public
route in the same browser session, and supabase-js will send that user's JWT,
so PostgREST executes the query as authenticated rather than anon.
$comment$;
