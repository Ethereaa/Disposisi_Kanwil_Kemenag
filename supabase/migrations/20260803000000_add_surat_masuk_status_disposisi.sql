/*
# Add disposisi status workflow to surat_masuk

## Summary
Adds a workflow status to each Surat Masuk record — Baru -> Diproses ->
Selesai — tracked per record (the bidang it's disposed to is already
`tujuan_disposisi`; this tracks what's happened to it since). Combined
with `status_updated_at`, this is also what the overdue-reminder feature
(migrations 20260803000100/200 + the send-surat-overdue-reminders Edge
Function) uses to know how long a record has sat in "Diproses".

## Changes
1. `surat_masuk.status_disposisi` (text, NOT NULL, default 'baru',
   CHECK IN ('baru','diproses','selesai')) — existing rows all backfill to
   'baru' via the column default, since there's no prior data to infer a
   more accurate status from.
2. `surat_masuk.status_updated_at` (timestamptz, NOT NULL, default now())
   — when status_disposisi last changed. Existing rows default to now()
   at migration time; that's a reasonable start point (nobody's record
   should look artificially overdue the moment this ships).
3. A trigger that stamps status_updated_at to now() automatically whenever
   status_disposisi actually changes, so every write path (the app's
   updateStatusDisposisi(), a bulk import, a manual SQL fix) stays
   correct without each one having to remember to set it by hand.

## Security (RLS)
No policy changes — these are plain columns on a table that already has
RLS enabled with shared-access policies (see migration 20260728114553).
Any authenticated user could already UPDATE this row, so they can already
update its new columns too.
*/

ALTER TABLE surat_masuk
  ADD COLUMN IF NOT EXISTS status_disposisi text NOT NULL DEFAULT 'baru'
    CHECK (status_disposisi IN ('baru', 'diproses', 'selesai')),
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_surat_masuk_status_disposisi ON surat_masuk (status_disposisi);

CREATE OR REPLACE FUNCTION set_surat_masuk_status_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.status_disposisi IS DISTINCT FROM OLD.status_disposisi THEN
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_surat_masuk_status_updated_at ON surat_masuk;
CREATE TRIGGER trg_surat_masuk_status_updated_at
  BEFORE UPDATE OF status_disposisi ON surat_masuk
  FOR EACH ROW
  EXECUTE FUNCTION set_surat_masuk_status_updated_at();
