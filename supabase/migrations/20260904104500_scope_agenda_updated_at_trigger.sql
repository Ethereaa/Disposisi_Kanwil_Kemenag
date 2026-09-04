-- Root 5C.4.2
-- Keep agenda_pimpinan.updated_at tied to actual business-field edits.
--
-- The historical trigger fires on every UPDATE. That includes the internal
-- canonical resequence operation, which only changes nomor_urut and therefore
-- must not make an agenda appear as though its contents were edited.
--
-- Existing updated_at values are intentionally left untouched because the
-- historical trigger pollution makes the true prior edit time unknowable.
--
-- Ordering functions and ordering criteria are not changed.

begin;

do $$
declare
  trigger_definition text;
  dependent_count integer;
begin
  select pg_get_triggerdef(t.oid, true)
    into trigger_definition
  from pg_trigger t
  join pg_class c
    on c.oid = t.tgrelid
  join pg_namespace n
    on n.oid = c.relnamespace
  join pg_proc p
    on p.oid = t.tgfoid
  where not t.tgisinternal
    and n.nspname = 'public'
    and c.relname = 'agenda_pimpinan'
    and t.tgname = 'trg_agenda_pimpinan_updated_at'
    and p.proname = 'set_updated_at';

  if trigger_definition is null then
    raise exception
      'Expected trg_agenda_pimpinan_updated_at using set_updated_at() is missing';
  end if;

  if trigger_definition is distinct from
     'CREATE TRIGGER trg_agenda_pimpinan_updated_at BEFORE UPDATE ON agenda_pimpinan FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
  then
    raise exception
      'Unexpected current Agenda updated_at trigger definition: %',
      trigger_definition;
  end if;

  select count(*)
    into dependent_count
  from pg_trigger t
  join pg_proc p
    on p.oid = t.tgfoid
  join pg_namespace n
    on n.oid = p.pronamespace
  where not t.tgisinternal
    and n.nspname = 'public'
    and p.proname = 'set_updated_at';

  if dependent_count <> 1 then
    raise exception
      'Unexpected set_updated_at() trigger dependent count: %. Expected 1.',
      dependent_count;
  end if;
end
$$;

drop trigger trg_agenda_pimpinan_updated_at
  on public.agenda_pimpinan;

create trigger trg_agenda_pimpinan_updated_at
before update of
  tanggal_kegiatan,
  waktu_kegiatan,
  nama_kegiatan,
  tempat_kegiatan,
  keterangan,
  disposisi_pegawai
on public.agenda_pimpinan
for each row
execute function public.set_updated_at();

commit;
