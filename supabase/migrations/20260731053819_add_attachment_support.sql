-- Recovered from Supabase migration history (applied via dashboard).
-- version: 20260731053819  name: add_attachment_support

-- Lampiran PDF (dari scan WhatsApp atau upload manual) untuk 3 tabel utama.
ALTER TABLE surat_masuk ADD COLUMN IF NOT EXISTS lampiran_url text;
ALTER TABLE surat_masuk ADD COLUMN IF NOT EXISTS lampiran_nama text;

ALTER TABLE surat_keluar ADD COLUMN IF NOT EXISTS lampiran_url text;
ALTER TABLE surat_keluar ADD COLUMN IF NOT EXISTS lampiran_nama text;

ALTER TABLE agenda_pimpinan ADD COLUMN IF NOT EXISTS lampiran_url text;
ALTER TABLE agenda_pimpinan ADD COLUMN IF NOT EXISTS lampiran_nama text;

-- Antrean pairing token <-> foto WhatsApp. Alur:
-- 1) Form di web generate row baru (status 'waiting') + tampilkan QR berisi token.
-- 2) Kamu scan QR -> WA terbuka -> kirim foto dengan token di caption/pesan.
-- 3) Edge Function wa-webhook terima foto, convert ke PDF, upload ke Storage,
--    lalu UPDATE row ini jadi status 'done' + isi pdf_url.
-- 4) Form yang masih terbuka mendengarkan lewat Supabase Realtime pada baris
--    dengan token ini, begitu status 'done' -> auto-attach ke input.
CREATE TABLE IF NOT EXISTS wa_pending_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  target_table text NOT NULL CHECK (target_table IN ('surat_masuk', 'surat_keluar', 'agenda_pimpinan')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'done', 'expired')),
  pdf_url text,
  pdf_nama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  completed_at timestamptz
);

ALTER TABLE wa_pending_uploads ENABLE ROW LEVEL SECURITY;

-- Situs ini single-user (hanya kamu), jadi cukup: siapapun yang authenticated
-- boleh baca/tulis/hapus baris pairing token. Insert/select dipakai oleh
-- form web; update dipakai oleh Edge Function lewat service_role (bypass RLS).
DROP POLICY IF EXISTS "wa_pending_uploads_all_authenticated" ON wa_pending_uploads;
CREATE POLICY "wa_pending_uploads_all_authenticated"
  ON wa_pending_uploads FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_wa_pending_uploads_token ON wa_pending_uploads (token);

-- Realtime perlu tabel ini publish-kan perubahannya.
ALTER PUBLICATION supabase_realtime ADD TABLE wa_pending_uploads;

