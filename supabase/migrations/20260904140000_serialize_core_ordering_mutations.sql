-- Root 5E.2
-- Serialize canonical ordering mutations and introduce atomic update/delete
-- RPCs for the three core ordered tables.
--
-- Ordering contracts are intentionally unchanged:
--
--   surat_masuk
--     numeric nomor_agenda DESC NULLS LAST,
--     entry_seq DESC
--
--   surat_keluar
--     tanggal_surat DESC NULLS LAST,
--     entry_seq DESC
--
--   agenda_pimpinan
--     tanggal_kegiatan DESC NULLS LAST,
--     entry_seq DESC
--
-- Transaction-level advisory locks are scoped per table so unrelated core
-- tables may still mutate concurrently.
--
-- Lock namespace:
--   (61001, 1) -> surat_masuk ordering
--   (61001, 2) -> surat_keluar ordering
--   (61001, 3) -> agenda_pimpinan ordering
--
-- This migration deliberately does NOT make backup restore atomic.
-- Whole-restore transactionality belongs to Root 5F.

begin;

-- ===========================================================================
-- 1. FAIL-CLOSED PRECONDITIONS
-- ===========================================================================

do $$
declare
  function_count integer;
  existing_wrapper_count integer;

  masuk_source text;
  keluar_source text;
  agenda_source text;
begin
  select count(*)
    into function_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname in (
      'resequence_surat_masuk_by_nomor_agenda',
      'resequence_surat_keluar_by_tanggal',
      'resequence_agenda_pimpinan_by_date',
      'insert_surat_masuk_sorted',
      'insert_surat_keluar_sorted',
      'insert_agenda_pimpinan_sorted'
    );

  if function_count <> 6 then
    raise exception
      'ABORT: expected 6 audited insert/resequence functions, found %.',
      function_count;
  end if;

  -- This migration is the first owner of these atomic wrapper names.
  select count(*)
    into existing_wrapper_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname in (
      'update_surat_masuk_sorted',
      'update_surat_keluar_sorted',
      'update_agenda_pimpinan_sorted',
      'delete_surat_masuk_sorted',
      'delete_surat_keluar_sorted',
      'delete_agenda_pimpinan_sorted'
    );

  if existing_wrapper_count <> 0 then
    raise exception
      'ABORT: one or more Root 5E atomic wrapper functions already exist.';
  end if;

  -- No concurrency primitive existed in the audited pre-state.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'resequence_surat_masuk_by_nomor_agenda',
        'resequence_surat_keluar_by_tanggal',
        'resequence_agenda_pimpinan_by_date',
        'insert_surat_masuk_sorted',
        'insert_surat_keluar_sorted',
        'insert_agenda_pimpinan_sorted'
      )
      and lower(p.prosrc) like '%advisory%lock%'
  ) then
    raise exception
      'ABORT: audited core ordering functions already contain advisory locking.';
  end if;

  select p.prosrc
    into masuk_source
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resequence_surat_masuk_by_nomor_agenda'
    and p.prokind = 'f'
  limit 1;

  select p.prosrc
    into keluar_source
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resequence_surat_keluar_by_tanggal'
    and p.prokind = 'f'
  limit 1;

  select p.prosrc
    into agenda_source
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resequence_agenda_pimpinan_by_date'
    and p.prokind = 'f'
  limit 1;

  -- Guard the locked ordering contract before replacing anything.
  if position('nomor_agenda' in masuk_source) = 0
     or position('entry_seq DESC' in masuk_source) = 0
     or position('numeric' in masuk_source) = 0
  then
    raise exception
      'ABORT: Surat Masuk resequence comparator no longer matches audited contract.';
  end if;

  if position('tanggal_surat DESC NULLS LAST' in keluar_source) = 0
     or position('entry_seq DESC' in keluar_source) = 0
  then
    raise exception
      'ABORT: Surat Keluar resequence comparator no longer matches audited contract.';
  end if;

  if position('tanggal_kegiatan DESC NULLS LAST' in agenda_source) = 0
     or position('entry_seq DESC' in agenda_source) = 0
  then
    raise exception
      'ABORT: Agenda resequence comparator no longer matches audited contract.';
  end if;
end
$$;

-- ===========================================================================
-- 2. LOCK-SAFE CANONICAL RESEQUENCE FUNCTIONS
-- ===========================================================================

create or replace function public.resequence_surat_masuk_by_nomor_agenda()
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 1);

  update public.surat_masuk s
  set nomor_urut = ranked.rn
  from (
    select
      id,
      row_number() over (
        order by
          case
            when nomor_agenda ~ '^\s*\d+\s*$'
            then nomor_agenda::numeric
            else null
          end desc nulls last,
          entry_seq desc
      ) as rn
    from public.surat_masuk
  ) ranked
  where s.id = ranked.id
    and s.nomor_urut is distinct from ranked.rn;
end;
$$;

create or replace function public.resequence_surat_keluar_by_tanggal()
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 2);

  update public.surat_keluar s
  set nomor_urut = ranked.rn
  from (
    select
      id,
      row_number() over (
        order by
          tanggal_surat desc nulls last,
          entry_seq desc
      ) as rn
    from public.surat_keluar
  ) ranked
  where s.id = ranked.id
    and s.nomor_urut is distinct from ranked.rn;
end;
$$;

create or replace function public.resequence_agenda_pimpinan_by_date()
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 3);

  update public.agenda_pimpinan a
  set nomor_urut = ranked.rn
  from (
    select
      id,
      row_number() over (
        order by
          tanggal_kegiatan desc nulls last,
          entry_seq desc
      ) as rn
    from public.agenda_pimpinan
  ) ranked
  where a.id = ranked.id
    and a.nomor_urut is distinct from ranked.rn;
end;
$$;

-- ===========================================================================
-- 3. EXISTING ATOMIC INSERT RPCs
--
-- They were already one transaction. The only missing property was
-- serialization against another ordering mutation on the same table.
-- ===========================================================================

create or replace function public.insert_surat_masuk_sorted(
  p_nomor_surat text,
  p_nomor_agenda text,
  p_tanggal_surat date,
  p_tanggal_diterima date,
  p_pengirim text,
  p_perihal text,
  p_tujuan_disposisi text,
  p_sub_disposisi text,
  p_isi_disposisi text,
  p_keterangan text,
  p_created_by_email text
)
returns public.surat_masuk
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  new_row public.surat_masuk;
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 1);

  insert into public.surat_masuk (
    nomor_urut,
    nomor_surat,
    nomor_agenda,
    tanggal_surat,
    tanggal_diterima,
    pengirim,
    perihal,
    tujuan_disposisi,
    sub_disposisi,
    isi_disposisi,
    keterangan,
    created_by_email
  )
  values (
    0,
    p_nomor_surat,
    p_nomor_agenda,
    p_tanggal_surat,
    p_tanggal_diterima,
    p_pengirim,
    p_perihal,
    p_tujuan_disposisi,
    p_sub_disposisi,
    p_isi_disposisi,
    p_keterangan,
    p_created_by_email
  )
  returning id into new_id;

  perform public.resequence_surat_masuk_by_nomor_agenda();

  select *
    into new_row
  from public.surat_masuk
  where id = new_id;

  return new_row;
end;
$$;

create or replace function public.insert_surat_keluar_sorted(
  p_nomor_surat text,
  p_tanggal_surat date,
  p_pengirim text,
  p_perihal text,
  p_ditandatangani boolean,
  p_keterangan text,
  p_created_by_email text
)
returns public.surat_keluar
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  new_row public.surat_keluar;
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 2);

  insert into public.surat_keluar (
    nomor_urut,
    nomor_surat,
    tanggal_surat,
    pengirim,
    perihal,
    ditandatangani,
    keterangan,
    created_by_email
  )
  values (
    0,
    p_nomor_surat,
    p_tanggal_surat,
    p_pengirim,
    p_perihal,
    p_ditandatangani,
    p_keterangan,
    p_created_by_email
  )
  returning id into new_id;

  perform public.resequence_surat_keluar_by_tanggal();

  select *
    into new_row
  from public.surat_keluar
  where id = new_id;

  return new_row;
end;
$$;

create or replace function public.insert_agenda_pimpinan_sorted(
  p_tanggal_kegiatan date,
  p_waktu_kegiatan text,
  p_nama_kegiatan text,
  p_tempat_kegiatan text,
  p_keterangan text,
  p_disposisi_pegawai text,
  p_created_by_email text
)
returns public.agenda_pimpinan
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  new_row public.agenda_pimpinan;
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 3);

  insert into public.agenda_pimpinan (
    nomor_urut,
    tanggal_kegiatan,
    waktu_kegiatan,
    nama_kegiatan,
    tempat_kegiatan,
    keterangan,
    disposisi_pegawai,
    created_by_email
  )
  values (
    0,
    p_tanggal_kegiatan,
    p_waktu_kegiatan,
    p_nama_kegiatan,
    p_tempat_kegiatan,
    p_keterangan,
    p_disposisi_pegawai,
    p_created_by_email
  )
  returning id into new_id;

  perform public.resequence_agenda_pimpinan_by_date();

  select *
    into new_row
  from public.agenda_pimpinan
  where id = new_id;

  return new_row;
end;
$$;

-- ===========================================================================
-- 4. ATOMIC UPDATE RPCs
-- ===========================================================================

create function public.update_surat_masuk_sorted(
  p_id uuid,
  p_nomor_surat text,
  p_nomor_agenda text,
  p_tanggal_surat date,
  p_tanggal_diterima date,
  p_pengirim text,
  p_perihal text,
  p_tujuan_disposisi text,
  p_sub_disposisi text,
  p_isi_disposisi text,
  p_keterangan text
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 1);

  update public.surat_masuk
  set
    nomor_surat = p_nomor_surat,
    nomor_agenda = p_nomor_agenda,
    tanggal_surat = p_tanggal_surat,
    tanggal_diterima = p_tanggal_diterima,
    pengirim = p_pengirim,
    perihal = p_perihal,
    tujuan_disposisi = p_tujuan_disposisi,
    sub_disposisi = p_sub_disposisi,
    isi_disposisi = p_isi_disposisi,
    keterangan = p_keterangan,
    updated_at = pg_catalog.now()
  where id = p_id;

  perform public.resequence_surat_masuk_by_nomor_agenda();
end;
$$;

create function public.update_surat_keluar_sorted(
  p_id uuid,
  p_nomor_surat text,
  p_tanggal_surat date,
  p_pengirim text,
  p_perihal text,
  p_ditandatangani boolean,
  p_keterangan text
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 2);

  update public.surat_keluar
  set
    nomor_surat = p_nomor_surat,
    tanggal_surat = p_tanggal_surat,
    pengirim = p_pengirim,
    perihal = p_perihal,
    ditandatangani = p_ditandatangani,
    keterangan = p_keterangan,
    updated_at = pg_catalog.now()
  where id = p_id;

  perform public.resequence_surat_keluar_by_tanggal();
end;
$$;

create function public.update_agenda_pimpinan_sorted(
  p_id uuid,
  p_tanggal_kegiatan date,
  p_waktu_kegiatan text,
  p_nama_kegiatan text,
  p_tempat_kegiatan text,
  p_keterangan text,
  p_disposisi_pegawai text
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 3);

  update public.agenda_pimpinan
  set
    tanggal_kegiatan = p_tanggal_kegiatan,
    waktu_kegiatan = p_waktu_kegiatan,
    nama_kegiatan = p_nama_kegiatan,
    tempat_kegiatan = p_tempat_kegiatan,
    keterangan = p_keterangan,
    disposisi_pegawai = p_disposisi_pegawai
  where id = p_id;

  -- updated_at remains owned by the scoped Agenda business-field trigger.
  perform public.resequence_agenda_pimpinan_by_date();
end;
$$;

-- ===========================================================================
-- 5. ATOMIC DELETE RPCs
-- ===========================================================================

create function public.delete_surat_masuk_sorted(p_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 1);

  delete from public.surat_masuk
  where id = p_id;

  perform public.resequence_surat_masuk_by_nomor_agenda();
end;
$$;

create function public.delete_surat_keluar_sorted(p_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 2);

  delete from public.surat_keluar
  where id = p_id;

  perform public.resequence_surat_keluar_by_tanggal();
end;
$$;

create function public.delete_agenda_pimpinan_sorted(p_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 3);

  delete from public.agenda_pimpinan
  where id = p_id;

  perform public.resequence_agenda_pimpinan_by_date();
end;
$$;

-- ===========================================================================
-- 6. RPC PRIVILEGES
--
-- Supabase's public-schema default function ACL grants EXECUTE directly to
-- anon, authenticated, and service_role. Revoking PUBLIC alone is therefore
-- insufficient.
--
-- Normalize all twelve ordering mutation functions explicitly:
--   PUBLIC       -> no EXECUTE
--   anon         -> no EXECUTE
--   service_role -> no EXECUTE
--   authenticated -> EXECUTE
--
-- The functions remain SECURITY INVOKER, so underlying table RLS continues
-- to authorize the actual INSERT / UPDATE / DELETE.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Canonical resequence RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.resequence_surat_masuk_by_nomor_agenda()
  from public, anon, authenticated, service_role;

revoke all on function public.resequence_surat_keluar_by_tanggal()
  from public, anon, authenticated, service_role;

revoke all on function public.resequence_agenda_pimpinan_by_date()
  from public, anon, authenticated, service_role;

grant execute on function public.resequence_surat_masuk_by_nomor_agenda()
  to authenticated;

grant execute on function public.resequence_surat_keluar_by_tanggal()
  to authenticated;

grant execute on function public.resequence_agenda_pimpinan_by_date()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Existing atomic sorted INSERT RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.insert_surat_masuk_sorted(
  text, text, date, date, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

revoke all on function public.insert_surat_keluar_sorted(
  text, date, text, text, boolean, text, text
) from public, anon, authenticated, service_role;

revoke all on function public.insert_agenda_pimpinan_sorted(
  date, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.insert_surat_masuk_sorted(
  text, text, date, date, text, text, text, text, text, text, text
) to authenticated;

grant execute on function public.insert_surat_keluar_sorted(
  text, date, text, text, boolean, text, text
) to authenticated;

grant execute on function public.insert_agenda_pimpinan_sorted(
  date, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic UPDATE RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.update_surat_masuk_sorted(
  uuid, text, text, date, date, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

revoke all on function public.update_surat_keluar_sorted(
  uuid, text, date, text, text, boolean, text
) from public, anon, authenticated, service_role;

revoke all on function public.update_agenda_pimpinan_sorted(
  uuid, date, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.update_surat_masuk_sorted(
  uuid, text, text, date, date, text, text, text, text, text, text
) to authenticated;

grant execute on function public.update_surat_keluar_sorted(
  uuid, text, date, text, text, boolean, text
) to authenticated;

grant execute on function public.update_agenda_pimpinan_sorted(
  uuid, date, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic DELETE RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.delete_surat_masuk_sorted(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.delete_surat_keluar_sorted(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.delete_agenda_pimpinan_sorted(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.delete_surat_masuk_sorted(uuid)
  to authenticated;

grant execute on function public.delete_surat_keluar_sorted(uuid)
  to authenticated;

grant execute on function public.delete_agenda_pimpinan_sorted(uuid)
  to authenticated;

-- ===========================================================================
-- 7. FAIL-CLOSED POSTCONDITIONS
-- ===========================================================================

do $$
declare
  function_count integer;
  lock_aware_count integer;
  invoker_count integer;
  fixed_search_path_count integer;

  fn record;
begin
  select
    count(*),
    count(*) filter (
      where lower(p.prosrc) like '%pg_advisory_xact_lock%'
    ),
    count(*) filter (
      where p.prosecdef = false
    ),
    count(*) filter (
      where p.proconfig @> array['search_path=pg_catalog, public']::text[]
    )
    into
      function_count,
      lock_aware_count,
      invoker_count,
      fixed_search_path_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname in (
      'resequence_surat_masuk_by_nomor_agenda',
      'resequence_surat_keluar_by_tanggal',
      'resequence_agenda_pimpinan_by_date',
      'insert_surat_masuk_sorted',
      'insert_surat_keluar_sorted',
      'insert_agenda_pimpinan_sorted',
      'update_surat_masuk_sorted',
      'update_surat_keluar_sorted',
      'update_agenda_pimpinan_sorted',
      'delete_surat_masuk_sorted',
      'delete_surat_keluar_sorted',
      'delete_agenda_pimpinan_sorted'
    );

  if function_count <> 12 then
    raise exception
      'POSTCHECK: expected 12 ordering mutation functions, found %.',
      function_count;
  end if;

  if lock_aware_count <> 12 then
    raise exception
      'POSTCHECK: expected all 12 ordering mutation functions to be lock-aware; found %.',
      lock_aware_count;
  end if;

  if invoker_count <> 12 then
    raise exception
      'POSTCHECK: expected all 12 ordering mutation functions to remain SECURITY INVOKER; found %.',
      invoker_count;
  end if;

  if fixed_search_path_count <> 12 then
    raise exception
      'POSTCHECK: expected all 12 ordering mutation functions to have fixed search_path; found %.',
      fixed_search_path_count;
  end if;

  for fn in
    select
      p.oid,
      p.proname,
      p.proacl,
      p.proowner,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'resequence_surat_masuk_by_nomor_agenda',
        'resequence_surat_keluar_by_tanggal',
        'resequence_agenda_pimpinan_by_date',
        'insert_surat_masuk_sorted',
        'insert_surat_keluar_sorted',
        'insert_agenda_pimpinan_sorted',
        'update_surat_masuk_sorted',
        'update_surat_keluar_sorted',
        'update_agenda_pimpinan_sorted',
        'delete_surat_masuk_sorted',
        'delete_surat_keluar_sorted',
        'delete_agenda_pimpinan_sorted'
      )
  loop
    -- PUBLIC is PostgreSQL's pseudo-role. In ACL arrays it is represented by
    -- grantee OID 0, so inspect the ACL directly rather than pretending PUBLIC
    -- is an ordinary pg_roles entry.
    if exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          fn.proacl,
          pg_catalog.acldefault('f', fn.proowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    then
      raise exception
        'POSTCHECK: PUBLIC unexpectedly has EXECUTE on %(%).',
        fn.proname,
        fn.identity_args;
    end if;

    if has_function_privilege(
         'anon',
         fn.oid,
         'EXECUTE'
       )
    then
      raise exception
        'POSTCHECK: anon unexpectedly has EXECUTE on %(%).',
        fn.proname,
        fn.identity_args;
    end if;

    if has_function_privilege(
         'service_role',
         fn.oid,
         'EXECUTE'
       )
    then
      raise exception
        'POSTCHECK: service_role unexpectedly has EXECUTE on %(%).',
        fn.proname,
        fn.identity_args;
    end if;

    if not has_function_privilege(
         'authenticated',
         fn.oid,
         'EXECUTE'
       )
    then
      raise exception
        'POSTCHECK: authenticated is missing EXECUTE on %(%).',
        fn.proname,
        fn.identity_args;
    end if;
  end loop;
end
$$;
commit;
