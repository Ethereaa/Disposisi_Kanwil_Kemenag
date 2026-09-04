-- Root 5C.3
-- Align the database default with the established Agenda Pimpinan contract:
-- an omitted/empty Waktu Kegiatan means "no time", represented as ''.
--
-- Existing application writes already pass '' explicitly when the time field
-- is empty. This migration only prevents an omitted column from silently
-- becoming midnight ('00:00') through the historical database default.
--
-- Existing rows are not modified.
-- waktu_kegiatan remains NOT NULL.
-- The existing format CHECK remains unchanged.

begin;

do $$
declare
  current_default text;
  current_nullable text;
begin
  select column_default, is_nullable
    into current_default, current_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'agenda_pimpinan'
    and column_name = 'waktu_kegiatan';

  if current_default is distinct from '''00:00''::text' then
    raise exception
      'Unexpected agenda_pimpinan.waktu_kegiatan default: %. Expected ''00:00''::text.',
      coalesce(current_default, '<none>');
  end if;

  if current_nullable is distinct from 'NO' then
    raise exception
      'Unexpected agenda_pimpinan.waktu_kegiatan nullability: %. Expected NO.',
      coalesce(current_nullable, '<missing>');
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.agenda_pimpinan'::regclass
      and c.conname = 'agenda_pimpinan_waktu_kegiatan_format_check'
      and c.contype = 'c'
  ) then
    raise exception
      'Expected agenda_pimpinan_waktu_kegiatan_format_check is missing';
  end if;
end
$$;

alter table public.agenda_pimpinan
  alter column waktu_kegiatan set default '';

commit;
