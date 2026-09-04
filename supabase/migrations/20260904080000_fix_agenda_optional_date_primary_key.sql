-- Root 5B.2
-- Restore the intended Agenda Pimpinan database contract:
--   * id is the row identity / primary key
--   * tanggal_kegiatan is optional and may be NULL
--
-- Production was found with the accidental composite primary key:
--   PRIMARY KEY (tanggal_kegiatan, id, nomor_urut)
--
-- Because PRIMARY KEY columns are NOT NULL, that historical schema drift
-- prevents the application from saving an agenda whose date was cleared.
--
-- Keep agenda_pimpinan_id_key UNIQUE(id) for now. Existing foreign keys
-- reference agenda_pimpinan(id), and removing the redundant unique
-- constraint/index is a separate dependency-aware cleanup decision.

begin;

do $$
declare
  current_pk text;
begin
  select pg_get_constraintdef(c.oid, true)
    into current_pk
  from pg_constraint c
  where c.conrelid = 'public.agenda_pimpinan'::regclass
    and c.contype = 'p';

  if current_pk is distinct from
       'PRIMARY KEY (tanggal_kegiatan, id, nomor_urut)' then
    raise exception
      'Unexpected agenda_pimpinan primary key: %. Expected composite historical PK.',
      coalesce(current_pk, '<none>');
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.agenda_pimpinan'::regclass
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid, true) = 'UNIQUE (id)'
  ) then
    raise exception
      'Cannot repair agenda_pimpinan: expected UNIQUE(id) constraint is missing';
  end if;

  if exists (
    select 1
    from public.agenda_pimpinan
    where id is null
  ) then
    raise exception
      'Cannot repair agenda_pimpinan primary key: NULL id exists';
  end if;

  if exists (
    select 1
    from public.agenda_pimpinan
    group by id
    having count(*) > 1
  ) then
    raise exception
      'Cannot repair agenda_pimpinan primary key: duplicate id exists';
  end if;
end
$$;

alter table public.agenda_pimpinan
  drop constraint agenda_pimpinan_pkey;

alter table public.agenda_pimpinan
  alter column tanggal_kegiatan drop not null;

alter table public.agenda_pimpinan
  add constraint agenda_pimpinan_pkey primary key (id);

commit;
