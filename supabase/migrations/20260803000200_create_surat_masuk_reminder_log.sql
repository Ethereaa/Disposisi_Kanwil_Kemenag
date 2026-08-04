/*
# Create surat_masuk_reminder_log table

## Summary
Tracks which Surat Masuk have already had an overdue push notification
sent, so send-surat-overdue-reminders (a cron-triggered Edge Function,
mirroring send-agenda-reminders) stays idempotent across repeated runs —
same pattern as agenda_reminder_log (migration 20260731010000).

A record is only ever notified ONCE per time it becomes overdue: if it's
moved back out of "Diproses" and later back in, the earlier log row no
longer matches the (re-clocked) status_updated_at, so a fresh overdue
period can notify again — see the `notified_status_updated_at` column.

## New Tables
1. `surat_masuk_reminder_log`
   - id (uuid, primary key)
   - surat_masuk_id (uuid, references surat_masuk.id, cascade delete)
   - notified_status_updated_at (timestamptz) — the status_updated_at
     value at the moment this reminder was sent, so a later status change
     (back to Diproses, then overdue again) isn't silently suppressed by
     an old log row.
   - sent_at (timestamptz)
   - UNIQUE (surat_masuk_id, notified_status_updated_at)

## Security (RLS)
- RLS ENABLED, no policies for authenticated/anon — written only by the
  Edge Function via the service_role key, same posture as
  agenda_reminder_log.
*/

CREATE TABLE IF NOT EXISTS surat_masuk_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surat_masuk_id uuid NOT NULL REFERENCES surat_masuk(id) ON DELETE CASCADE,
  notified_status_updated_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (surat_masuk_id, notified_status_updated_at)
);

ALTER TABLE surat_masuk_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_surat_masuk_reminder_log_surat_id ON surat_masuk_reminder_log (surat_masuk_id);
