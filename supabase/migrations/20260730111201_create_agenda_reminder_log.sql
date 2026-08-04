-- Recovered from Supabase migration history (applied via dashboard).
-- version: 20260730111201  name: create_agenda_reminder_log

CREATE TABLE IF NOT EXISTS agenda_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id uuid NOT NULL REFERENCES agenda_pimpinan(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('h-1', 'h-0')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agenda_id, reminder_type)
);

ALTER TABLE agenda_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agenda_reminder_log_agenda_id ON agenda_reminder_log (agenda_id);

