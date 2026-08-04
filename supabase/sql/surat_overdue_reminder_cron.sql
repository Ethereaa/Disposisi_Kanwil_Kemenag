-- Jadwal otomatis untuk reminder Surat Masuk yang terlambat diproses.
-- Jalankan di Supabase SQL Editor SETELAH:
--   1. Edge Function "send-surat-overdue-reminders" sudah di-deploy
--      (supabase functions deploy send-surat-overdue-reminders)
--   2. Secrets sudah di-set (sama seperti send-agenda-reminders — kalau
--      itu sudah jalan, tidak ada secret baru yang perlu ditambahkan).
--   3. Ganti PROJECT_REF dan CRON_SECRET_VALUE di bawah dengan nilai asli
--      milikmu (CRON_SECRET_VALUE harus SAMA PERSIS dengan yang di-set
--      sebagai secret CRON_SECRET pada Edge Function).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Jam 08:00 WITA setiap hari kerja (Senin-Jumat) (= 00:00 UTC) -> cek
-- surat masuk yang sudah lewat ambang batas hari kerja di status
-- "Diproses". Cukup sekali sehari karena ambang batasnya dihitung dalam
-- hari kerja, bukan jam.
SELECT cron.schedule(
  'surat-overdue-reminder-pagi',
  '0 0 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/send-surat-overdue-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Untuk melihat jadwal yang sudah aktif:
--   SELECT * FROM cron.job;
-- Untuk menghapus jadwal:
--   SELECT cron.unschedule('surat-overdue-reminder-pagi');
-- Untuk uji coba manual (tanpa menunggu jadwal):
--   SELECT net.http_post(
--     url := 'https://PROJECT_REF.supabase.co/functions/v1/send-surat-overdue-reminders',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CRON_SECRET_VALUE'),
--     body := '{}'::jsonb
--   );
