/*
# Create app_settings table

## Summary
A small shared key/value table for office-wide settings — values every
user sees and can change the same way `surat_masuk`/`surat_keluar` data
is shared (see migration 20260728114553's RLS notes). First use: the
"days before a Diproses Surat Masuk counts as overdue" threshold, edited
from Settings and read by both the app and the send-surat-overdue-reminders
Edge Function. Generic on purpose, so future settings don't need a new
table each time.

## New Tables
1. `app_settings`
   - key (text, primary key)
   - value (text, not null)
   - updated_at (timestamptz)

## Security (RLS)
- RLS ENABLED, shared-access policies like the surat tables: any
  authenticated user can read and write. This is an office-wide setting,
  not a per-user preference, so that's intentional.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_app_settings" ON app_settings;
CREATE POLICY "shared_select_app_settings"
  ON app_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "shared_upsert_app_settings" ON app_settings;
CREATE POLICY "shared_upsert_app_settings"
  ON app_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shared_update_app_settings" ON app_settings;
CREATE POLICY "shared_update_app_settings"
  ON app_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

INSERT INTO app_settings (key, value)
VALUES ('surat_overdue_threshold_days', '3')
ON CONFLICT (key) DO NOTHING;
