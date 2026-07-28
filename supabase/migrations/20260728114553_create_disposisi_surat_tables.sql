/*
# Create shared mail disposition tables for family use

## Summary
This migration creates the cloud database tables that store "Surat Masuk"
(incoming mail) and "Surat Keluar" (outgoing mail) disposition records for the
Kanwil Kemenag Gorontalo disposition app. The app is used by a small family
group (9-10 people) who ALL share the SAME data — every authenticated user can
read and write every mail record. There is no per-user data isolation.

## New Tables
1. `surat_masuk` — incoming mail disposition records
   - id (uuid, primary key)
   - nomor_urut (integer, sequential number shown to user)
   - nomor_surat (text, manual letter number)
   - nomor_agenda (text, manual agenda number — NOT automatic)
   - tanggal_surat (date, letter date)
   - tanggal_diterima (date, date received)
   - pengirim (text, sender)
   - perihal (text, subject)
   - tujuan_disposisi (text, disposition target dropdown value)
   - sub_disposisi (text, nullable, sub-target when tujuan = 'Kabag TU')
   - isi_disposisi (text, disposition content)
   - keterangan (text, notes)
   - created_by (uuid, references auth.users — who created the record)
   - created_by_email (text, email of creator for display)
   - created_at (timestamptz)
   - updated_at (timestamptz)

2. `surat_keluar` — outgoing mail disposition records
   - id (uuid, primary key)
   - nomor_urut (integer, sequential number)
   - nomor_surat (text, optional letter number)
   - tanggal_surat (date, letter date)
   - pengirim (text, sender)
   - perihal (text, subject)
   - ditandatangani (boolean, signed status)
   - keterangan (text, notes)
   - created_by (uuid, references auth.users)
   - created_by_email (text, email of creator)
   - created_at (timestamptz)
   - updated_at (timestamptz)

## Security (RLS)
- Row Level Security ENABLED on both tables.
- Policies are SHARED-DATA scoped: any authenticated user can SELECT, INSERT,
  UPDATE, and DELETE ALL rows. This is intentional — the app is for a family
  group where everyone shares the same mail records. There is no per-user
  isolation. Only authenticated users (family members with accounts) can access
  the data; anonymous/unauthenticated access is blocked.
- created_by defaults to auth.uid() so inserts that omit it still record the
  signed-in user. This is for audit/display only — it does NOT restrict access.

## Notes
1. nomor_urut is managed by the app (computed as max+1) because it must be
   sequential per-table and shown to users in order.
2. created_by_email is denormalized for easy display ("added by X") without
   joining auth.users, which is not readable from the anon key.
3. Dates are stored as ISO date (yyyy-mm-dd) and displayed as DD/MM/YYYY.
*/

-- ===== surat_masuk =====
CREATE TABLE IF NOT EXISTS surat_masuk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_urut integer NOT NULL,
  nomor_surat text NOT NULL DEFAULT '',
  nomor_agenda text NOT NULL DEFAULT '',
  tanggal_surat date,
  tanggal_diterima date,
  pengirim text NOT NULL DEFAULT '',
  perihal text NOT NULL DEFAULT '',
  tujuan_disposisi text NOT NULL DEFAULT '',
  sub_disposisi text,
  isi_disposisi text NOT NULL DEFAULT '',
  keterangan text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE surat_masuk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_select_surat_masuk" ON surat_masuk;
CREATE POLICY "family_select_surat_masuk"
  ON surat_masuk FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "family_insert_surat_masuk" ON surat_masuk;
CREATE POLICY "family_insert_surat_masuk"
  ON surat_masuk FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "family_update_surat_masuk" ON surat_masuk;
CREATE POLICY "family_update_surat_masuk"
  ON surat_masuk FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "family_delete_surat_masuk" ON surat_masuk;
CREATE POLICY "family_delete_surat_masuk"
  ON surat_masuk FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_surat_masuk_nomor_urut ON surat_masuk (nomor_urut);
CREATE INDEX IF NOT EXISTS idx_surat_masuk_created_at ON surat_masuk (created_at);

-- ===== surat_keluar =====
CREATE TABLE IF NOT EXISTS surat_keluar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_urut integer NOT NULL,
  nomor_surat text NOT NULL DEFAULT '',
  tanggal_surat date,
  pengirim text NOT NULL DEFAULT '',
  perihal text NOT NULL DEFAULT '',
  ditandatangani boolean NOT NULL DEFAULT false,
  keterangan text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE surat_keluar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_select_surat_keluar" ON surat_keluar;
CREATE POLICY "family_select_surat_keluar"
  ON surat_keluar FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "family_insert_surat_keluar" ON surat_keluar;
CREATE POLICY "family_insert_surat_keluar"
  ON surat_keluar FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "family_update_surat_keluar" ON surat_keluar;
CREATE POLICY "family_update_surat_keluar"
  ON surat_keluar FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "family_delete_surat_keluar" ON surat_keluar;
CREATE POLICY "family_delete_surat_keluar"
  ON surat_keluar FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_surat_keluar_nomor_urut ON surat_keluar (nomor_urut);
CREATE INDEX IF NOT EXISTS idx_surat_keluar_created_at ON surat_keluar (created_at);
