/*
# Reliable same-date tiebreak using a strictly increasing counter

## Problem
The previous tiebreak used created_at DESC to decide "most recently
input first" for two agenda on the same tanggal_kegiatan. In practice,
created_at timestamps can be identical or too close to reliably compare
(e.g. rows entered close together, or older rows that were bulk-inserted
in one statement where now() is evaluated once for the whole statement).
When created_at ties, sorting falls back to whatever order the database
returns rows in, which is not guaranteed to match true input order and
in this data happened to line up with time-of-day instead.

## Fix
Add entry_seq, a bigserial column. Every INSERT gets an auto-incrementing
value from a dedicated sequence, so it can never tie between two
different rows, regardless of how close together they were created.
resequence_agenda_pimpinan_by_date() now tiebreaks on entry_seq DESC
(higher = inserted later = shows first) instead of created_at DESC.
*/

ALTER TABLE agenda_pimpinan ADD COLUMN IF NOT EXISTS entry_seq bigserial;

GRANT USAGE, SELECT ON SEQUENCE agenda_pimpinan_entry_seq_seq TO authenticated;

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
               entry_seq DESC
    ) AS rn
    FROM agenda_pimpinan
  ) ranked
  WHERE a.id = ranked.id
    AND a.nomor_urut IS DISTINCT FROM ranked.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION resequence_agenda_pimpinan_by_date() TO authenticated;

-- Re-rank existing rows under the new tiebreak. Note: entry_seq for rows
-- that already existed before this migration was backfilled in whatever
-- order Postgres scanned the table (usually physical/insertion order),
-- so this is the closest available approximation of true input order for
-- old rows. Every row entered from now on gets a guaranteed-correct,
-- collision-proof entry_seq.
SELECT resequence_agenda_pimpinan_by_date();
