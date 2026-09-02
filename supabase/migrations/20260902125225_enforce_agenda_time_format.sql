-- Agenda time is optional, but when present it must be a real 24-hour HH:MM
-- value. Keep the empty string valid because Agenda Pimpinan supports partial
-- records.

-- Defensive cleanup for any malformed legacy values that might exist in
-- another environment before the constraint is installed.
update public.agenda_pimpinan
set waktu_kegiatan = ''
where waktu_kegiatan <> ''
  and waktu_kegiatan !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

alter table public.agenda_pimpinan
  drop constraint if exists agenda_pimpinan_waktu_kegiatan_format_check;

alter table public.agenda_pimpinan
  add constraint agenda_pimpinan_waktu_kegiatan_format_check
  check (
    waktu_kegiatan = ''
    or waktu_kegiatan ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );