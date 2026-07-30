-- Jadwal otomatis untuk reminder Agenda Pimpinan (H-1 dan hari-H).
-- Jalankan di Supabase SQL Editor SETELAH:
--   1. Edge Function "send-agenda-reminders" sudah di-deploy
--      (supabase functions deploy send-agenda-reminders)
--   2. Secrets sudah di-set (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--      VAPID_SUBJECT, CRON_SECRET) lewat `supabase secrets set ...`
--   3. Ganti PROJECT_REF dan CRON_SECRET_VALUE di bawah dengan nilai asli
--      milikmu (CRON_SECRET_VALUE harus SAMA PERSIS dengan yang di-set
--      sebagai secret CRON_SECRET pada Edge Function).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Jam 06:30 WITA setiap hari (= 22:30 UTC hari sebelumnya) -> cek reminder
-- hari-H (agenda yang jadwalnya hari ini).
SELECT cron.schedule(
  'agenda-reminder-pagi',
  '30 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/send-agenda-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Jam 16:00 WITA setiap hari (= 08:00 UTC) -> cek reminder H-1 (agenda
-- yang jadwalnya besok), supaya pimpinan/staf sudah tahu dari sore hari
-- sebelumnya.
SELECT cron.schedule(
  'agenda-reminder-sore',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/send-agenda-reminders',
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
-- Untuk menghapus salah satu jadwal:
--   SELECT cron.unschedule('agenda-reminder-pagi');
--   SELECT cron.unschedule('agenda-reminder-sore');
