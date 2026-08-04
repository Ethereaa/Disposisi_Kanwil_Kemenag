-- Recovered from Supabase migration history (applied via dashboard).
-- version: 20260731053835  name: create_lampiran_storage_bucket

-- Bucket untuk lampiran PDF surat/agenda (dari WhatsApp maupun upload manual).
-- Private (bukan public) — akses lewat signed URL atau RLS authenticated.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lampiran', 'lampiran', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- User yang login boleh baca semua lampiran (situs single-user/kantor kecil).
DROP POLICY IF EXISTS "lampiran_select_authenticated" ON storage.objects;
CREATE POLICY "lampiran_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'lampiran');

-- User yang login boleh upload lampiran manual dari form.
DROP POLICY IF EXISTS "lampiran_insert_authenticated" ON storage.objects;
CREATE POLICY "lampiran_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lampiran');

DROP POLICY IF EXISTS "lampiran_delete_authenticated" ON storage.objects;
CREATE POLICY "lampiran_delete_authenticated"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'lampiran');

