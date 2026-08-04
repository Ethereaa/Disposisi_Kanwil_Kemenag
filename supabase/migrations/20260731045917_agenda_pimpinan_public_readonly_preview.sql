-- Recovered from Supabase migration history (applied via dashboard).
-- version: 20260731045917  name: agenda_pimpinan_public_readonly_preview

-- Allow anonymous (not-logged-in) read access to agenda_pimpinan so the
-- standalone "Preview Agenda Pimpinan" screen works from any device,
-- logged in or not (e.g. a lobby display / kiosk / shared link).
-- Only SELECT is opened up for anon; insert/update/delete stay
-- authenticated-only via the existing policies.
CREATE POLICY "agenda_pimpinan_select_public"
  ON agenda_pimpinan FOR SELECT
  TO anon
  USING (true);

