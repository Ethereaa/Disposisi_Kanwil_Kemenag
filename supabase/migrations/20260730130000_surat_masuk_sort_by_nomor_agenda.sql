/*
# Sort Surat Masuk by Nomor Agenda (highest first), not by insertion order

## Problem
nomor_urut for surat_masuk was previously just "next available number"
(max + 1), so rows were always numbered in the order they happened to be
typed in. The user wants the list ordered by Nomor Agenda instead — the
row with the highest Nomor Agenda should always be No. 1, regardless of
when it was entered.

## Fix
Mirrors the existing agenda_pimpinan pattern (see
20260730120000_agenda_pimpinan_entry_seq_tiebreak.sql):

1. entry_seq — a bigserial column giving every row a strictly increasing,
   collision-proof insertion counter (used only as a tiebreaker).
2. resequence_surat_masuk_by_nomor_agenda() — recomputes nomor_urut for
   every row, ordered by:
     a. nomor_agenda, treated as a number when it's purely digits
        (DESC, highest first; non-numeric or blank values sort last)
     b. entry_seq DESC as a tiebreak (most recently entered first) for
        equal/invalid nomor_agenda values
3. insert_surat_masuk_sorted() — inserts the new row and then calls the
   resequence function in the same transaction (one round trip, atomic).

nomor_agenda stays a free-text column (still manual, still supports
non-numeric formats) — the numeric sort only kicks in for values that are
purely digits; anything else falls back to the entry_seq tiebreak instead
of erroring out.

The trailing SELECT fixes numbering for rows that already exist.
*/

ALTER TABLE surat_masuk ADD COLUMN IF NOT EXISTS entry_seq bigserial;

GRANT USAGE, SELECT ON SEQUENCE surat_masuk_entry_seq_seq TO authenticated;

CREATE OR REPLACE FUNCTION resequence_surat_masuk_by_nomor_agenda()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE surat_masuk s
  SET nomor_urut = ranked.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN nomor_agenda ~ '^\s*\d+\s*$' THEN nomor_agenda::numeric ELSE NULL END DESC NULLS LAST,
        entry_seq DESC
    ) AS rn
    FROM surat_masuk
  ) ranked
  WHERE s.id = ranked.id
    AND s.nomor_urut IS DISTINCT FROM ranked.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION resequence_surat_masuk_by_nomor_agenda() TO authenticated;

CREATE OR REPLACE FUNCTION insert_surat_masuk_sorted(
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
RETURNS surat_masuk
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid;
  new_row surat_masuk;
BEGIN
  INSERT INTO surat_masuk (
    nomor_urut, nomor_surat, nomor_agenda, tanggal_surat, tanggal_diterima,
    pengirim, perihal, tujuan_disposisi, sub_disposisi, isi_disposisi,
    keterangan, created_by_email
  )
  VALUES (
    0, p_nomor_surat, p_nomor_agenda, p_tanggal_surat, p_tanggal_diterima,
    p_pengirim, p_perihal, p_tujuan_disposisi, p_sub_disposisi, p_isi_disposisi,
    p_keterangan, p_created_by_email
  )
  RETURNING id INTO new_id;

  PERFORM resequence_surat_masuk_by_nomor_agenda();

  SELECT * INTO new_row FROM surat_masuk WHERE id = new_id;
  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_surat_masuk_sorted(
  text, text, date, date, text, text, text, text, text, text, text
) TO authenticated;

-- Fix numbering for rows that already exist in the live table.
SELECT resequence_surat_masuk_by_nomor_agenda();
