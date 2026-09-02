-- Root 3F.4: permanently retire the attachment subsystem.
--
-- The application no longer reads or writes attachment metadata.
-- Attachment Storage objects were purged through the Supabase Storage API,
-- and the obsolete `lampiran` / `lampiran-surat` buckets were removed
-- operationally before this migration.
--
-- Historical migrations are intentionally preserved.
--
-- This migration:
--   1. Refuses to continue if attachment metadata or Storage objects exist.
--   2. Drops obsolete attachment columns from the three business tables.
--   3. Drops obsolete attachment policies from storage.objects.
--
-- No CASCADE is used. An unexpected database dependency must abort instead
-- of silently removing another object.

DO $$
DECLARE
    v_attachment_rows bigint;
    v_storage_objects bigint;
BEGIN
    -- --------------------------------------------------
    -- Safety: no business record may still contain attachment metadata.
    -- to_jsonb() keeps this check safe even if a legacy column is already
    -- absent in another environment.
    -- --------------------------------------------------

    SELECT
        (
            SELECT count(*)
            FROM public.surat_masuk t
            WHERE
                CASE
                    WHEN to_jsonb(t)->'lampiran' IS NULL THEN false
                    WHEN jsonb_typeof(to_jsonb(t)->'lampiran') = 'array'
                        THEN jsonb_array_length(to_jsonb(t)->'lampiran') > 0
                    ELSE true
                END
                OR nullif(to_jsonb(t)->>'lampiran_url', '') IS NOT NULL
                OR nullif(to_jsonb(t)->>'lampiran_nama', '') IS NOT NULL
        )
        +
        (
            SELECT count(*)
            FROM public.surat_keluar t
            WHERE
                CASE
                    WHEN to_jsonb(t)->'lampiran' IS NULL THEN false
                    WHEN jsonb_typeof(to_jsonb(t)->'lampiran') = 'array'
                        THEN jsonb_array_length(to_jsonb(t)->'lampiran') > 0
                    ELSE true
                END
                OR nullif(to_jsonb(t)->>'lampiran_url', '') IS NOT NULL
                OR nullif(to_jsonb(t)->>'lampiran_nama', '') IS NOT NULL
        )
        +
        (
            SELECT count(*)
            FROM public.agenda_pimpinan t
            WHERE
                CASE
                    WHEN to_jsonb(t)->'lampiran' IS NULL THEN false
                    WHEN jsonb_typeof(to_jsonb(t)->'lampiran') = 'array'
                        THEN jsonb_array_length(to_jsonb(t)->'lampiran') > 0
                    ELSE true
                END
                OR nullif(to_jsonb(t)->>'lampiran_url', '') IS NOT NULL
                OR nullif(to_jsonb(t)->>'lampiran_nama', '') IS NOT NULL
        )
    INTO v_attachment_rows;

    IF v_attachment_rows <> 0 THEN
        RAISE EXCEPTION
            'ABORT: found % business record(s) containing attachment metadata.',
            v_attachment_rows;
    END IF;

    -- --------------------------------------------------
    -- Safety: the retired Storage buckets must contain no objects.
    -- Bucket rows themselves may already have been removed through
    -- the Storage API / Dashboard.
    -- --------------------------------------------------

    SELECT count(*)
    INTO v_storage_objects
    FROM storage.objects
    WHERE bucket_id IN ('lampiran', 'lampiran-surat');

    IF v_storage_objects <> 0 THEN
        RAISE EXCEPTION
            'ABORT: found % attachment Storage object(s).',
            v_storage_objects;
    END IF;

    -- --------------------------------------------------
    -- Remove attachment columns.
    -- No CASCADE: unexpected dependencies cause a safe failure.
    -- --------------------------------------------------

    EXECUTE '
        ALTER TABLE public.surat_masuk
            DROP COLUMN IF EXISTS lampiran,
            DROP COLUMN IF EXISTS lampiran_url,
            DROP COLUMN IF EXISTS lampiran_nama
    ';

    EXECUTE '
        ALTER TABLE public.surat_keluar
            DROP COLUMN IF EXISTS lampiran,
            DROP COLUMN IF EXISTS lampiran_url,
            DROP COLUMN IF EXISTS lampiran_nama
    ';

    EXECUTE '
        ALTER TABLE public.agenda_pimpinan
            DROP COLUMN IF EXISTS lampiran,
            DROP COLUMN IF EXISTS lampiran_url,
            DROP COLUMN IF EXISTS lampiran_nama
    ';

    -- --------------------------------------------------
    -- Remove active and legacy attachment Storage policies.
    -- --------------------------------------------------

    EXECUTE 'DROP POLICY IF EXISTS "family_select_lampiran_surat" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "family_insert_lampiran_surat" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "family_update_lampiran_surat" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "family_delete_lampiran_surat" ON storage.objects';

    EXECUTE 'DROP POLICY IF EXISTS "lampiran_select_authenticated" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "lampiran_insert_authenticated" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "lampiran_delete_authenticated" ON storage.objects';
END
$$;