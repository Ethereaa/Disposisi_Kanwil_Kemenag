-- Script siap pakai untuk Supabase SQL Editor
-- Tujuan: membuat tabel agenda_pimpinan, menambahkan kolom waktu_kegiatan, mengaktifkan RLS, dan memastikan data bisa diakses/diubah oleh semua user yang sudah login.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agenda_pimpinan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_urut integer NOT NULL,
  tanggal_kegiatan date,
  waktu_kegiatan text NOT NULL DEFAULT '00:00',
  nama_kegiatan text NOT NULL DEFAULT '',
  tempat_kegiatan text NOT NULL DEFAULT '',
  keterangan text NOT NULL DEFAULT '',
  disposisi_pegawai text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_pimpinan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_pimpinan_select_all" ON public.agenda_pimpinan;
CREATE POLICY "agenda_pimpinan_select_all"
  ON public.agenda_pimpinan FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "agenda_pimpinan_insert_all" ON public.agenda_pimpinan;
CREATE POLICY "agenda_pimpinan_insert_all"
  ON public.agenda_pimpinan FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_pimpinan_update_all" ON public.agenda_pimpinan;
CREATE POLICY "agenda_pimpinan_update_all"
  ON public.agenda_pimpinan FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_pimpinan_delete_all" ON public.agenda_pimpinan;
CREATE POLICY "agenda_pimpinan_delete_all"
  ON public.agenda_pimpinan FOR DELETE
  TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agenda_pimpinan_updated_at ON public.agenda_pimpinan;
CREATE TRIGGER trg_agenda_pimpinan_updated_at
BEFORE UPDATE ON public.agenda_pimpinan
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_agenda_pimpinan_nomor_urut ON public.agenda_pimpinan (nomor_urut);
CREATE INDEX IF NOT EXISTS idx_agenda_pimpinan_created_at ON public.agenda_pimpinan (created_at);

-- Optional: cek hasil pembuatan tabel
SELECT 'agenda_pimpinan siap digunakan' AS status;
