/*
Create agenda pimpinan table for the disposisi app.
*/

CREATE TABLE IF NOT EXISTS agenda_pimpinan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_urut integer NOT NULL,
  tanggal_kegiatan date,
  nama_kegiatan text NOT NULL DEFAULT '',
  tempat_kegiatan text NOT NULL DEFAULT '',
  keterangan text NOT NULL DEFAULT '',
  disposisi_pegawai text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agenda_pimpinan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_select_agenda_pimpinan" ON agenda_pimpinan;
CREATE POLICY "family_select_agenda_pimpinan"
  ON agenda_pimpinan FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "family_insert_agenda_pimpinan" ON agenda_pimpinan;
CREATE POLICY "family_insert_agenda_pimpinan"
  ON agenda_pimpinan FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "family_update_agenda_pimpinan" ON agenda_pimpinan;
CREATE POLICY "family_update_agenda_pimpinan"
  ON agenda_pimpinan FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "family_delete_agenda_pimpinan" ON agenda_pimpinan;
CREATE POLICY "family_delete_agenda_pimpinan"
  ON agenda_pimpinan FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_agenda_pimpinan_nomor_urut ON agenda_pimpinan (nomor_urut);
CREATE INDEX IF NOT EXISTS idx_agenda_pimpinan_created_at ON agenda_pimpinan (created_at);
