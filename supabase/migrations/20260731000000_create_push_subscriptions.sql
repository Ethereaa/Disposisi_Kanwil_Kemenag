/*
# Create push_subscriptions table for Web Push reminders

## Summary
Stores one row per browser/device Push subscription so the server (a
Supabase Edge Function, see supabase/functions/send-agenda-reminders) can
send Web Push notifications for Agenda Pimpinan reminders (H-1 and hari-H),
without needing a native app or third-party push service.

## New Tables
1. `push_subscriptions`
   - id (uuid, primary key)
   - user_id (uuid, references auth.users.id) — who owns this device
   - endpoint (text, unique, not null) — the browser's push endpoint URL,
     doubles as the natural dedupe key (one row per registered device)
   - p256dh (text, not null) — subscription encryption key
   - auth_key (text, not null) — subscription auth secret
   - device_label (text) — optional human-friendly label (e.g. browser/OS
     string) shown in Settings so a user can tell devices apart
   - created_at, last_seen_at (timestamptz)

## Security (RLS)
- RLS ENABLED.
- SELECT/INSERT/UPDATE/DELETE: a user may only touch their OWN
  subscription rows (auth.uid() = user_id). This is intentionally NOT
  shared like `profiles` — a push subscription is private to a device.
- The reminder-sending Edge Function uses the service_role key, which
  bypasses RLS entirely, so it can read every subscription regardless of
  owner in order to broadcast reminders to all staff/pimpinan devices.

## Notes
- `endpoint` is UNIQUE so re-subscribing the same browser upserts instead
  of creating duplicate rows (see push.ts client helper, which upserts on
  conflict target `endpoint`).
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  device_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "select_own_push_subscriptions"
  ON push_subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "insert_own_push_subscriptions"
  ON push_subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "update_own_push_subscriptions"
  ON push_subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "delete_own_push_subscriptions"
  ON push_subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);
