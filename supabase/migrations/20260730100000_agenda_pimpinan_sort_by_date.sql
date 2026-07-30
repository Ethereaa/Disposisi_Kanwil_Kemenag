/*
# Sort Agenda Pimpinan by event date, not by insertion order

## Problem
insert_agenda_pimpinan_at_top() (previous migration) always forced a newly
added row to nomor_urut = 1 "regardless of its event date". That means
typing in an *older* tanggal_kegiatan after a newer one still shoved it to
the top of the list, and the client-side sort in the preview screen was
also broken (comparing dates with Number(...).localeCompare(...), which is
not a real function on numbers and silently no-ops). Net effect: nomor_urut
tracked "when I typed it in", not "when the event happens".

## Fix
nomor_urut becomes a value that is *always recomputed from the data* by
resequence_agenda_pimpinan_by_date(), ordered by:
  1. tanggal_kegiatan DESC  (newest date first, nulls last)
  2. waktu_kegiatan   ASC   (earlier time of day first, within same date)
  3. created_at       DESC  (tie-breaker if date + time are identical)

insert_agenda_pimpinan_sorted() inserts the new row and then calls the
resequence function in the same transaction (one network round trip,
atomic). update/delete paths call the resequence function too, so editing
a date or removing a row always keeps numbering in date order.

The one-off SELECT at the end fixes any rows that are already
mis-numbered in the live table from the old insert-at-top behavior.
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
               waktu_kegiatan ASC NULLS LAST,
               created_at DESC
    ) AS rn
    FROM agenda_pimpinan
  ) ranked
  WHERE a.id = ranked.id
    AND a.nomor_urut IS DISTINCT FROM ranked.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION resequence_agenda_pimpinan_by_date() TO authenticated;

CREATE OR REPLACE FUNCTION insert_agenda_pimpinan_sorted(
  p_tanggal_kegiatan date,
  p_waktu_kegiatan text,
  p_nama_kegiatan text,
  p_tempat_kegiatan text,
  p_keterangan text,
  p_disposisi_pegawai text,
  p_created_by_email text
)
RETURNS agenda_pimpinan
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid;
  new_row agenda_pimpinan;
BEGIN
  INSERT INTO agenda_pimpinan (
    nomor_urut, tanggal_kegiatan, waktu_kegiatan, nama_kegiatan,
    tempat_kegiatan, keterangan, disposisi_pegawai, created_by_email
  )
  VALUES (
    0, p_tanggal_kegiatan, p_waktu_kegiatan, p_nama_kegiatan,
    p_tempat_kegiatan, p_keterangan, p_disposisi_pegawai, p_created_by_email
  )
  RETURNING id INTO new_id;

  PERFORM resequence_agenda_pimpinan_by_date();

  SELECT * INTO new_row FROM agenda_pimpinan WHERE id = new_id;
  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_agenda_pimpinan_sorted(
  date, text, text, text, text, text, text
) TO authenticated;

-- The old "always insert at #1" function is no longer used by the app.
DROP FUNCTION IF EXISTS insert_agenda_pimpinan_at_top(
  date, text, text, text, text, text, text
);

-- Fix numbering for rows that already exist in the live table.
SELECT resequence_agenda_pimpinan_by_date();
