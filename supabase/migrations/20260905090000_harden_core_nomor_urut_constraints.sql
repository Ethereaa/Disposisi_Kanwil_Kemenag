-- Root 5E.5
-- Harden the structural contract of nomor_urut on the three core ordered
-- tables: surat_masuk, surat_keluar, agenda_pimpinan.
--
-- Target contract per table:
--   nomor_urut integer NOT NULL              (already true; asserted here)
--   CHECK (nomor_urut > 0)                   (new)
--   UNIQUE (nomor_urut) DEFERRABLE INITIALLY DEFERRED   (new)
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
-- Non-numeric nomor_agenda remains fully supported; the comparator still
-- sorts it into the NULLS LAST bucket and no constraint is placed on it.
--
-- Why UNIQUE must be DEFERRABLE INITIALLY DEFERRED
--
--   The canonical resequence functions are a single set-based UPDATE that
--   rewrites every changed rank at once, so ranks rotate (3 -> 1, 1 -> 2,
--   2 -> 3). An immediate unique constraint is checked per row as that
--   UPDATE progresses and therefore always sees a transient collision.
--   Empirically confirmed on TEMP tables: the rotation is rejected with
--   SQLSTATE 23505 under an immediate UNIQUE and passes under a deferred
--   one. Deferring to commit is what makes set-based resequencing legal.
--
-- Why the sorted INSERT RPCs must change first
--
--   They currently insert the literal placeholder nomor_urut = 0 and then
--   call the canonical resequence to assign the real rank. CHECK (> 0)
--   cannot be deferred in PostgreSQL, so that placeholder is rejected with
--   SQLSTATE 23514 the moment the CHECK exists. Section 2 replaces the 0
--   placeholder with coalesce(max(nomor_urut), 0) + 1, computed while the
--   existing per-table advisory lock is already held, which is positive by
--   construction and provably absent from the table at that instant.
--
-- Lock namespace (unchanged):
--   (61001, 1) -> surat_masuk ordering
--   (61001, 2) -> surat_keluar ordering
--   (61001, 3) -> agenda_pimpinan ordering
--
-- Deliberately NOT changed by this migration:
--   RLS policies, public preview semantics, status_disposisi behavior,
--   the status_updated_at trigger, the scoped Agenda updated_at trigger,
--   the optional Agenda date/time contract, backup restore transactionality
--   (Root 5F), the legacy unused client helpers (Root 6), and the existing
--   non-unique idx_<table>_nomor_urut btrees, which are retained on purpose
--   so that this migration's production DDL surface stays as small as
--   possible. The unique indexes backing the new constraints are additional,
--   not replacements.

begin;

-- Fail fast instead of queueing behind a long transaction while holding
-- ACCESS EXCLUSIVE on a live table.
set local lock_timeout = '10s';

-- ===========================================================================
-- 0. WRITE BARRIER
--
-- Every precondition below reads live table contents, and every DDL statement
-- below assumes those contents did not change in the meantime. The barrier is
-- taken before the first precondition so the entire migration observes one
-- stable snapshot of the three core tables.
--
-- Lock order is fixed and deliberate:
--
--   1. advisory (61001, 1)  surat_masuk ordering
--   2. advisory (61001, 2)  surat_keluar ordering
--   3. advisory (61001, 3)  agenda_pimpinan ordering
--   4. LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE
--
-- The production ordering RPCs already take their advisory lock first and
-- only then touch table rows. Taking the table lock before the advisory locks
-- here would invert that order and could deadlock against them, so the
-- advisory locks always come first, in ascending key order. The keys are the
-- existing Root 5E.2 ordering keys and are not redefined here.
--
-- pg_advisory_xact_lock, not pg_advisory_lock: transaction-scoped locks are
-- released automatically at COMMIT or ROLLBACK, including on a failed
-- precondition, so no manual unlock path is needed.
--
-- SHARE ROW EXCLUSIVE conflicts with ROW EXCLUSIVE, so it stops every
-- INSERT / UPDATE / DELETE on the three tables while still letting plain
-- SELECT traffic through. Section 3's ALTER TABLE later upgrades this to
-- ACCESS EXCLUSIVE. Both waits are bounded by the lock_timeout set above.
-- ===========================================================================

do $write_barrier$
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 1);
  perform pg_catalog.pg_advisory_xact_lock(61001, 2);
  perform pg_catalog.pg_advisory_xact_lock(61001, 3);

  lock table
    public.surat_masuk,
    public.surat_keluar,
    public.agenda_pimpinan
    in share row exclusive mode;
end
$write_barrier$;

-- ===========================================================================
-- 1. FAIL-CLOSED PRECONDITIONS
-- ===========================================================================

-- 1a. Column shape: the column must already exist as a NOT NULL integer.
do $precheck_shape$
declare
  core_table text;
  core_tables text[] := array[
    'surat_masuk',
    'surat_keluar',
    'agenda_pimpinan'
  ];
  col_type text;
  col_notnull boolean;
begin
  foreach core_table in array core_tables loop
    select
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      a.attnotnull
      into
        col_type,
        col_notnull
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c
      on c.oid = a.attrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = core_table
      and c.relkind = 'r'
      and a.attname = 'nomor_urut'
      and a.attnum > 0
      and not a.attisdropped;

    if col_type is null then
      raise exception
        'ABORT: public.%.nomor_urut was not found.',
        core_table;
    end if;

    if col_type <> 'integer' then
      raise exception
        'ABORT: public.%.nomor_urut expected integer, found %.',
        core_table,
        col_type;
    end if;

    if not col_notnull then
      raise exception
        'ABORT: public.%.nomor_urut is nullable. Root 5E.5 assumes NOT NULL '
        'is already in force; refusing to backfill nullable ranks here.',
        core_table;
    end if;
  end loop;
end
$precheck_shape$;

-- 1b. The constraint names this migration owns must not already exist, so a
-- re-run reports a clear reason instead of a bare duplicate-object error.
do $precheck_names$
declare
  taken text;
begin
  select pg_catalog.string_agg(conname, ', ' order by conname)
    into taken
  from pg_catalog.pg_constraint
  where conname in (
    'surat_masuk_nomor_urut_positive',
    'surat_keluar_nomor_urut_positive',
    'agenda_pimpinan_nomor_urut_positive',
    'surat_masuk_nomor_urut_unique',
    'surat_keluar_nomor_urut_unique',
    'agenda_pimpinan_nomor_urut_unique'
  );

  if taken is not null then
    raise exception
      'ABORT: constraint(s) already present: %. Root 5E.5 has already been '
      'applied, or the names collide with unrelated objects.',
      taken;
  end if;
end
$precheck_names$;

-- 1c. Existing data must already satisfy the target contract. If it does
-- not, that is a data defect to investigate, not something to force past.
do $precheck_data$
declare
  null_count integer;
  nonpositive_count integer;
  duplicate_count integer;
  mismatch_count integer;
begin
  select
    count(*) filter (where nomor_urut is null),
    count(*) filter (where nomor_urut <= 0),
    count(*) - count(distinct nomor_urut)
    into
      null_count,
      nonpositive_count,
      duplicate_count
  from public.surat_masuk;

  if null_count <> 0 or nonpositive_count <> 0 or duplicate_count <> 0 then
    raise exception
      'ABORT: public.surat_masuk.nomor_urut violates the target contract '
      '(null=%, non_positive=%, duplicates=%).',
      null_count,
      nonpositive_count,
      duplicate_count;
  end if;

  select
    count(*) filter (where nomor_urut is null),
    count(*) filter (where nomor_urut <= 0),
    count(*) - count(distinct nomor_urut)
    into
      null_count,
      nonpositive_count,
      duplicate_count
  from public.surat_keluar;

  if null_count <> 0 or nonpositive_count <> 0 or duplicate_count <> 0 then
    raise exception
      'ABORT: public.surat_keluar.nomor_urut violates the target contract '
      '(null=%, non_positive=%, duplicates=%).',
      null_count,
      nonpositive_count,
      duplicate_count;
  end if;

  select
    count(*) filter (where nomor_urut is null),
    count(*) filter (where nomor_urut <= 0),
    count(*) - count(distinct nomor_urut)
    into
      null_count,
      nonpositive_count,
      duplicate_count
  from public.agenda_pimpinan;

  if null_count <> 0 or nonpositive_count <> 0 or duplicate_count <> 0 then
    raise exception
      'ABORT: public.agenda_pimpinan.nomor_urut violates the target contract '
      '(null=%, non_positive=%, duplicates=%).',
      null_count,
      nonpositive_count,
      duplicate_count;
  end if;

  -- Canonical rank agreement, evaluated with the locked comparators.
  select count(*)
    into mismatch_count
  from (
    select
      s.nomor_urut,
      row_number() over (
        order by
          case
            when s.nomor_agenda ~ '^\s*\d+\s*$'
              then s.nomor_agenda::numeric
            else null
          end desc nulls last,
          s.entry_seq desc
      ) as rn
    from public.surat_masuk s
  ) ranked
  where ranked.nomor_urut is distinct from ranked.rn;

  if mismatch_count <> 0 then
    raise exception
      'ABORT: public.surat_masuk has % row(s) whose nomor_urut disagrees with '
      'the canonical order. Resequence before hardening.',
      mismatch_count;
  end if;

  select count(*)
    into mismatch_count
  from (
    select
      s.nomor_urut,
      row_number() over (
        order by s.tanggal_surat desc nulls last, s.entry_seq desc
      ) as rn
    from public.surat_keluar s
  ) ranked
  where ranked.nomor_urut is distinct from ranked.rn;

  if mismatch_count <> 0 then
    raise exception
      'ABORT: public.surat_keluar has % row(s) whose nomor_urut disagrees '
      'with the canonical order. Resequence before hardening.',
      mismatch_count;
  end if;

  select count(*)
    into mismatch_count
  from (
    select
      a.nomor_urut,
      row_number() over (
        order by a.tanggal_kegiatan desc nulls last, a.entry_seq desc
      ) as rn
    from public.agenda_pimpinan a
  ) ranked
  where ranked.nomor_urut is distinct from ranked.rn;

  if mismatch_count <> 0 then
    raise exception
      'ABORT: public.agenda_pimpinan has % row(s) whose nomor_urut disagrees '
      'with the canonical order. Resequence before hardening.',
      mismatch_count;
  end if;
end
$precheck_data$;

-- 1d. The ordering RPC contract from Root 5E.2 must still be intact, and the
-- sorted INSERT RPCs must not already carry the hardened placeholder.
do $precheck_functions$
declare
  function_count integer;
  lock_aware_count integer;
  invoker_count integer;
  fixed_search_path_count integer;
  already_hardened_count integer;
  comparator_ok boolean;
begin
  select
    count(*),
    count(*) filter (
      where pg_catalog.strpos(p.prosrc, 'pg_advisory_xact_lock(61001') > 0
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
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
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
      'ABORT: expected 12 ordering mutation functions, found %.',
      function_count;
  end if;

  if lock_aware_count <> 12 then
    raise exception
      'ABORT: expected all 12 ordering mutation functions to take the (61001, n) '
      'advisory lock; found %.',
      lock_aware_count;
  end if;

  if invoker_count <> 12 then
    raise exception
      'ABORT: expected all 12 ordering mutation functions to be SECURITY '
      'INVOKER; found %.',
      invoker_count;
  end if;

  if fixed_search_path_count <> 12 then
    raise exception
      'ABORT: expected all 12 ordering mutation functions to pin '
      'search_path = pg_catalog, public; found %.',
      fixed_search_path_count;
  end if;

  select count(*)
    into already_hardened_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname in (
      'insert_surat_masuk_sorted',
      'insert_surat_keluar_sorted',
      'insert_agenda_pimpinan_sorted'
    )
    and pg_catalog.strpos(
          p.prosrc,
          'coalesce(pg_catalog.max(nomor_urut), 0) + 1'
        ) > 0;

  if already_hardened_count <> 0 then
    raise exception
      'ABORT: % sorted INSERT function(s) already use the hardened positive '
      'placeholder. Root 5E.5 appears to be partially applied.',
      already_hardened_count;
  end if;

  -- The locked comparators must still be the ones the constraints are being
  -- hardened around. strpos, not LIKE: LIKE would treat the backslashes in
  -- the '^\s*\d+\s*$' pattern as escape characters.
  select
    pg_catalog.strpos(p.prosrc, 'nomor_agenda ~ ''^\s*\d+\s*$''') > 0
    and pg_catalog.strpos(p.prosrc, 'entry_seq desc') > 0
    into comparator_ok
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resequence_surat_masuk_by_nomor_agenda';

  if not coalesce(comparator_ok, false) then
    raise exception
      'ABORT: resequence_surat_masuk_by_nomor_agenda no longer matches the '
      'locked comparator (numeric nomor_agenda desc nulls last, entry_seq desc).';
  end if;

  select
    pg_catalog.strpos(p.prosrc, 'tanggal_surat desc nulls last') > 0
    and pg_catalog.strpos(p.prosrc, 'entry_seq desc') > 0
    into comparator_ok
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resequence_surat_keluar_by_tanggal';

  if not coalesce(comparator_ok, false) then
    raise exception
      'ABORT: resequence_surat_keluar_by_tanggal no longer matches the locked '
      'comparator (tanggal_surat desc nulls last, entry_seq desc).';
  end if;

  select
    pg_catalog.strpos(p.prosrc, 'tanggal_kegiatan desc nulls last') > 0
    and pg_catalog.strpos(p.prosrc, 'entry_seq desc') > 0
    into comparator_ok
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resequence_agenda_pimpinan_by_date';

  if not coalesce(comparator_ok, false) then
    raise exception
      'ABORT: resequence_agenda_pimpinan_by_date no longer matches the locked '
      'comparator (tanggal_kegiatan desc nulls last, entry_seq desc).';
  end if;
end
$precheck_functions$;

-- ===========================================================================
-- 2. SORTED INSERT RPCs: POSITIVE TEMPORARY RANK INSTEAD OF 0
--
-- Only the placeholder changes. Signatures, SECURITY INVOKER, the pinned
-- search_path, the advisory lock keys, the inserted column list, the
-- canonical resequence call, created_by_email handling, the Agenda optional
-- date/time contract, Surat Masuk status behavior and the composite return
-- shape are all preserved. CREATE OR REPLACE also preserves the existing
-- ACLs granted in Root 5E.2.
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
  placeholder_nomor_urut integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 1);

  -- Positive placeholder rank. Computed after the advisory lock is held, so
  -- no other ordering mutation can be mid-flight on this table, and
  -- max + 1 is therefore guaranteed absent from the table. The canonical
  -- resequence below overwrites it with the real rank before commit, and the
  -- deferred UNIQUE is only evaluated at commit.
  select coalesce(pg_catalog.max(nomor_urut), 0) + 1
    into placeholder_nomor_urut
  from public.surat_masuk;

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
    placeholder_nomor_urut,
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
  placeholder_nomor_urut integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 2);

  select coalesce(pg_catalog.max(nomor_urut), 0) + 1
    into placeholder_nomor_urut
  from public.surat_keluar;

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
    placeholder_nomor_urut,
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
  placeholder_nomor_urut integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(61001, 3);

  select coalesce(pg_catalog.max(nomor_urut), 0) + 1
    into placeholder_nomor_urut
  from public.agenda_pimpinan;

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
    placeholder_nomor_urut,
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
-- 3. CONSTRAINTS
--
-- Minimal contract, deliberately three constraints and no more:
--
--   NOT NULL   already in force; restated so the migration is self-describing
--   CHECK > 0  every persisted rank is a valid 1-based rank; immediate,
--              because PostgreSQL cannot defer CHECK or NOT NULL
--   UNIQUE     deferred to commit so set-based rank rotation stays legal
--
-- No contiguity trigger. Contiguity is already produced and re-proved by the
-- canonical resequence functions on every ordering mutation, and a trigger
-- enforcing it would have to fire per statement against the whole table for
-- no additional guarantee.
-- ===========================================================================

alter table public.surat_masuk
  alter column nomor_urut set not null,
  add constraint surat_masuk_nomor_urut_positive
    check (nomor_urut > 0),
  add constraint surat_masuk_nomor_urut_unique
    unique (nomor_urut) deferrable initially deferred;

alter table public.surat_keluar
  alter column nomor_urut set not null,
  add constraint surat_keluar_nomor_urut_positive
    check (nomor_urut > 0),
  add constraint surat_keluar_nomor_urut_unique
    unique (nomor_urut) deferrable initially deferred;

alter table public.agenda_pimpinan
  alter column nomor_urut set not null,
  add constraint agenda_pimpinan_nomor_urut_positive
    check (nomor_urut > 0),
  add constraint agenda_pimpinan_nomor_urut_unique
    unique (nomor_urut) deferrable initially deferred;

-- ===========================================================================
-- 4. POSTCONDITIONS
-- ===========================================================================

-- 4a. The three-part contract exists, is validated, and the unique constraint
-- is genuinely deferred rather than merely deferrable.
do $postcheck_contract$
declare
  core_table text;
  core_tables text[] := array[
    'surat_masuk',
    'surat_keluar',
    'agenda_pimpinan'
  ];
  col_notnull boolean;
  check_ok boolean;
  unique_ok boolean;
  index_total integer;
  index_unique integer;
begin
  foreach core_table in array core_tables loop
    select a.attnotnull
      into col_notnull
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c
      on c.oid = a.attrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = core_table
      and a.attname = 'nomor_urut';

    if not coalesce(col_notnull, false) then
      raise exception
        'POSTCHECK: public.%.nomor_urut is not NOT NULL.',
        core_table;
    end if;

    select exists (
      select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c
        on c.oid = con.conrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = core_table
        and con.conname = core_table || '_nomor_urut_positive'
        and con.contype = 'c'
        and con.convalidated
        and pg_catalog.pg_get_constraintdef(con.oid) = 'CHECK ((nomor_urut > 0))'
    )
      into check_ok;

    if not check_ok then
      raise exception
        'POSTCHECK: %_nomor_urut_positive is missing, unvalidated, or does not '
        'read CHECK ((nomor_urut > 0)).',
        core_table;
    end if;

    select exists (
      select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c
        on c.oid = con.conrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = core_table
        and con.conname = core_table || '_nomor_urut_unique'
        and con.contype = 'u'
        and con.convalidated
        and con.condeferrable
        and con.condeferred
        and pg_catalog.pg_get_constraintdef(con.oid)
              = 'UNIQUE (nomor_urut) DEFERRABLE INITIALLY DEFERRED'
    )
      into unique_ok;

    if not unique_ok then
      raise exception
        'POSTCHECK: %_nomor_urut_unique is missing, unvalidated, or is not '
        'UNIQUE (nomor_urut) DEFERRABLE INITIALLY DEFERRED.',
        core_table;
    end if;

    -- At least one unique index on the bare (nomor_urut) column: the one that
    -- backs the deferred UNIQUE constraint added above.
    --
    -- The pre-existing non-unique btree idx_<table>_nomor_urut is deliberately
    -- retained by this root to keep the production DDL surface as small as
    -- possible, so a total of two (nomor_urut) indexes is expected here and is
    -- explicitly accepted. Only the absence of a unique one is a failure.
    select
      count(*),
      count(*) filter (where i.indisunique)
      into
        index_total,
        index_unique
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c
      on c.oid = i.indrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = core_table
      and pg_catalog.right(
            pg_catalog.pg_get_indexdef(i.indexrelid),
            12
          ) = '(nomor_urut)';

    if index_unique < 1 then
      raise exception
        'POSTCHECK: public.% has no unique (nomor_urut) index backing '
        '%_nomor_urut_unique; found total=%, unique=%.',
        core_table,
        core_table,
        index_total,
        index_unique;
    end if;
  end loop;
end
$postcheck_contract$;

-- 4b. The ordering RPC contract survived CREATE OR REPLACE, the sorted INSERT
-- functions now carry the positive placeholder, and the ACLs are unchanged.
do $postcheck_functions$
declare
  function_count integer;
  lock_aware_count integer;
  invoker_count integer;
  fixed_search_path_count integer;
  hardened_count integer;
  fn record;
begin
  select
    count(*),
    count(*) filter (
      where pg_catalog.strpos(p.prosrc, 'pg_advisory_xact_lock(61001') > 0
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
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
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

  if function_count <> 12
     or lock_aware_count <> 12
     or invoker_count <> 12
     or fixed_search_path_count <> 12
  then
    raise exception
      'POSTCHECK: ordering RPC contract broken (count=%, lock_aware=%, '
      'invoker=%, fixed_search_path=%); expected 12 for each.',
      function_count,
      lock_aware_count,
      invoker_count,
      fixed_search_path_count;
  end if;

  select count(*)
    into hardened_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname in (
      'insert_surat_masuk_sorted',
      'insert_surat_keluar_sorted',
      'insert_agenda_pimpinan_sorted'
    )
    and pg_catalog.strpos(
          p.prosrc,
          'coalesce(pg_catalog.max(nomor_urut), 0) + 1'
        ) > 0
    -- Whitespace-normalised so the old "values (\n    0," placeholder cannot
    -- hide behind reindentation or a different line ending.
    and pg_catalog.strpos(
          pg_catalog.regexp_replace(p.prosrc, '\s+', '', 'g'),
          'values(0,'
        ) = 0;

  if hardened_count <> 3 then
    raise exception
      'POSTCHECK: expected 3 sorted INSERT functions using the positive '
      'placeholder and no literal 0 rank; found %.',
      hardened_count;
  end if;

  for fn in
    select
      p.oid,
      p.proname,
      p.proacl,
      p.proowner,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'insert_surat_masuk_sorted',
        'insert_surat_keluar_sorted',
        'insert_agenda_pimpinan_sorted'
      )
  loop
    -- PUBLIC is grantee OID 0 in ACL arrays, not an ordinary pg_roles entry.
    if exists (
      select 1
      from pg_catalog.aclexplode(
             coalesce(fn.proacl, pg_catalog.acldefault('f', fn.proowner))
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

    if pg_catalog.has_function_privilege('anon', fn.oid, 'EXECUTE') then
      raise exception
        'POSTCHECK: anon unexpectedly has EXECUTE on %(%).',
        fn.proname,
        fn.identity_args;
    end if;

    if pg_catalog.has_function_privilege('service_role', fn.oid, 'EXECUTE') then
      raise exception
        'POSTCHECK: service_role unexpectedly has EXECUTE on %(%).',
        fn.proname,
        fn.identity_args;
    end if;

    if not pg_catalog.has_function_privilege(
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
$postcheck_functions$;

-- 4c. Hardening must not have disturbed the data or the canonical ranks.
do $postcheck_data$
declare
  core_table text;
  core_tables text[] := array[
    'surat_masuk',
    'surat_keluar',
    'agenda_pimpinan'
  ];
  bad_count integer;
begin
  foreach core_table in array core_tables loop
    execute pg_catalog.format(
      'select count(*) from public.%I '
      'where nomor_urut is null or nomor_urut <= 0',
      core_table
    )
    into bad_count;

    if bad_count <> 0 then
      raise exception
        'POSTCHECK: public.% still has % null or non-positive nomor_urut row(s).',
        core_table,
        bad_count;
    end if;
  end loop;
end
$postcheck_data$;

commit;
