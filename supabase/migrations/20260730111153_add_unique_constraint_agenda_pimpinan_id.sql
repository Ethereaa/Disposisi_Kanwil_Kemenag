-- Recovered from Supabase migration history (applied via dashboard).
-- version: 20260730111153  name: add_unique_constraint_agenda_pimpinan_id

ALTER TABLE agenda_pimpinan ADD CONSTRAINT agenda_pimpinan_id_key UNIQUE (id);
