/*
# Create agenda_reminder_log table

## Summary
Tracks which (agenda, reminder type) pairs have already been pushed, so the
send-agenda-reminders Edge Function stays idempotent even if its cron
schedule fires more than once around the same time, or is re-run manually.

## New Tables
1. `agenda_reminder_log`
   - id (uuid, primary key)
   - agenda_id (uuid, references agenda_pimpinan.id, cascade delete)
   - reminder_type (text) — 'h-1' (day before) or 'h-0' (day of)
   - sent_at (timestamptz)
   - UNIQUE (agenda_id, reminder_type) — an insert for an already-sent pair
     fails/conflicts, which the Edge Function uses as its "already sent"
     check via an upsert-or-skip pattern.

## Security (RLS)
- RLS ENABLED, but with NO policies for `authenticated`/`anon` — this table
  is written only by the Edge Function via the service_role key (which
  bypasses RLS). Regular app users have no reason to read or write it
  directly, so the default-deny posture is intentional.
*/

CREATE TABLE IF NOT EXISTS agenda_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id uuid NOT NULL REFERENCES agenda_pimpinan(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('h-1', 'h-0')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agenda_id, reminder_type)
);

ALTER TABLE agenda_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agenda_reminder_log_agenda_id ON agenda_reminder_log (agenda_id);
