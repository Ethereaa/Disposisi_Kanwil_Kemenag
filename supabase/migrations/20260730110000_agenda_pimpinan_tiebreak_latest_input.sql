/*
# Change same-date tiebreak: latest input on top (was: earliest time-of-day)

## Change
resequence_agenda_pimpinan_by_date() previously broke ties between two
agenda on the same tanggal_kegiatan by waktu_kegiatan ASC (earlier time of
day first). Per user request, same-date entries should instead show the
most recently input row on top, matching the "newest input = higher up"
behavior the user wants for ties.

New order:
  1. tanggal_kegiatan DESC  (newest date first, nulls last)
  2. created_at       DESC  (most recently added first, within same date)

waktu_kegiatan is no longer part of the ordering.

The trailing SELECT re-runs the resequence immediately so existing rows
reflect the new tiebreak right away.
*/

CREATE OR REPLACE FUNCTION resequence_agenda_pimpinan_by_date()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agenda_pimpinan a
  SET nomor_urut = ranked.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY tanggal_kegiatan DESC NULLS LAST,
               created_at DESC
    ) AS rn
    FROM agenda_pimpinan
  ) ranked
  WHERE a.id = ranked.id
    AND a.nomor_urut IS DISTINCT FROM ranked.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION resequence_agenda_pimpinan_by_date() TO authenticated;

-- Re-rank existing rows under the new tiebreak.
SELECT resequence_agenda_pimpinan_by_date();
