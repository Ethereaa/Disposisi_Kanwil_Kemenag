-- Recovered from Supabase migration history (applied via dashboard).
-- version: 20260731064145  name: add_lampiran_attachments

-- ===== lampiran columns =====
ALTER TABLE surat_masuk ADD COLUMN IF NOT EXISTS lampiran jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE surat_keluar ADD COLUMN IF NOT EXISTS lampiran jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agenda_pimpinan ADD COLUMN IF NOT EXISTS lampiran jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ===== storage bucket =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('lampiran-surat', 'lampiran-surat', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "family_select_lampiran_surat" ON storage.objects;
CREATE POLICY "family_select_lampiran_surat"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'lampiran-surat');

DROP POLICY IF EXISTS "family_insert_lampiran_surat" ON storage.objects;
CREATE POLICY "family_insert_lampiran_surat"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lampiran-surat');

DROP POLICY IF EXISTS "family_update_lampiran_surat" ON storage.objects;
CREATE POLICY "family_update_lampiran_surat"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'lampiran-surat')
  WITH CHECK (bucket_id = 'lampiran-surat');

DROP POLICY IF EXISTS "family_delete_lampiran_surat" ON storage.objects;
CREATE POLICY "family_delete_lampiran_surat"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'lampiran-surat');
