/*
# Add basic admin/staf roles and restrict deletion to admins

## Summary
Adds a `role` column to `profiles` ('admin' or 'staf') and tightens the
DELETE policies on surat_masuk, surat_keluar, and agenda_pimpinan so only
admins can permanently remove records. Everyone (admin and staf) can still
SELECT/INSERT/UPDATE — staf can view and add data, only admin can delete.

## Changes
1. `profiles.role` (text, default 'staf', values: 'admin' | 'staf').
   - Every EXISTING user is backfilled to 'admin' so nobody who already had
     full access loses it when this migration runs.
   - New signups default to 'staf'; promote someone with:
       update profiles set role = 'admin' where username = '<username>';
2. DELETE policies on surat_masuk / surat_keluar / agenda_pimpinan now check
   that the caller's profiles.role = 'admin'.

## Security (RLS)
- SELECT/INSERT/UPDATE policies are unchanged (still shared, all authenticated
  users).
- DELETE is now admin-only via a subquery against profiles.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staf';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staf'));

-- Backfill: everyone who already has an account keeps full (admin) access.
UPDATE profiles SET role = 'admin' WHERE role IS NULL OR role = 'staf';

-- New signups going forward default to 'staf' (see handle_new_user trigger note below).
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'staf';

DROP POLICY IF EXISTS "family_delete_surat_masuk" ON surat_masuk;
CREATE POLICY "admin_delete_surat_masuk"
  ON surat_masuk FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "family_delete_surat_keluar" ON surat_keluar;
CREATE POLICY "admin_delete_surat_keluar"
  ON surat_keluar FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "family_delete_agenda_pimpinan" ON agenda_pimpinan;
CREATE POLICY "admin_delete_agenda_pimpinan"
  ON agenda_pimpinan FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
