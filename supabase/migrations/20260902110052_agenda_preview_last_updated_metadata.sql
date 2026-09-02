-- Public freshness metadata for Agenda Pimpinan preview.
--
-- "Terakhir diperbarui" means the creation time of the newest agenda record
-- currently stored, NOT the time an anonymous visitor opened/refreshed the page.
--
-- Keep this separate from agenda_pimpinan_public. That row-level public view
-- deliberately exposes only the approved agenda business fields and must not
-- be widened with created_at/updated_at merely for one footer timestamp.
--
-- This aggregate exposes one world-readable metadata value only.

CREATE VIEW public.agenda_pimpinan_public_meta AS
SELECT
  MAX(created_at) AS last_created_at
FROM public.agenda_pimpinan;

-- Default privileges in this project can grant broad privileges to new views.
-- Revoke everything immediately, then grant only the read privilege needed by
-- the public preview route.
REVOKE ALL ON public.agenda_pimpinan_public_meta
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.agenda_pimpinan_public_meta
TO anon, authenticated;

COMMENT ON VIEW public.agenda_pimpinan_public_meta IS $comment$
Public read-only metadata for Agenda Pimpinan preview.

Exposes exactly one aggregate value:
  last_created_at = MAX(agenda_pimpinan.created_at)

Used only for the "Terakhir diperbarui" footer on /agenda-preview.

It intentionally does NOT expose created_at per agenda row, updated_at,
created_by_email, entry_seq, or any other internal metadata.
$comment$;