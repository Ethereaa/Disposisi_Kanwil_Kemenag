/*
# Sort Surat Keluar by Tanggal Surat (latest date first), not by insertion order

## Problem
nomor_urut for surat_keluar was previously just "next available number"
(max + 1), so rows were always numbered in the order they happened to be
typed in. The user wants the list ordered by Tanggal Surat instead — the
row with the latest (most recent) Tanggal Surat should always be No. 1,
regardless of when it was entered.

## Fix
Mirrors the existing agenda_pimpinan / surat_masuk pattern (see
20260730120000_agenda_pimpinan_entry_seq_tiebreak.sql and
20260730130000_surat_masuk_sort_by_nomor_agenda.sql):

1. entry_seq — a bigserial column giving every row a strictly increasing,
   collision-proof insertion counter (used only as a tiebreaker).
2. resequence_surat_keluar_by_tanggal() — recomputes nomor_urut for every
   row, ordered by:
     a. tanggal_surat DESC NULLS LAST (latest date first, blank dates last)
     b. entry_seq DESC as a tiebreak (most recently entered first) for
        rows sharing the same date
3. insert_surat_keluar_sorted() — inserts the new row and then calls the
   resequence function in the same transaction (one round trip, atomic).

The trailing SELECT fixes numbering for rows that already exist.
*/

ALTER TABLE surat_keluar ADD COLUMN IF NOT EXISTS entry_seq bigserial;

GRANT USAGE, SELECT ON SEQUENCE surat_keluar_entry_seq_seq TO authenticated;

CREATE OR REPLACE FUNCTION resequence_surat_keluar_by_tanggal()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE surat_keluar s
  SET nomor_urut = ranked.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY tanggal_surat DESC NULLS LAST,
               entry_seq DESC
    ) AS rn
    FROM surat_keluar
  ) ranked
  WHERE s.id = ranked.id
    AND s.nomor_urut IS DISTINCT FROM ranked.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION resequence_surat_keluar_by_tanggal() TO authenticated;

CREATE OR REPLACE FUNCTION insert_surat_keluar_sorted(
  p_nomor_surat text,
  p_tanggal_surat date,
  p_pengirim text,
  p_perihal text,
  p_ditandatangani boolean,
  p_keterangan text,
  p_created_by_email text
)
RETURNS surat_keluar
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid;
  new_row surat_keluar;
BEGIN
  INSERT INTO surat_keluar (
    nomor_urut, nomor_surat, tanggal_surat, pengirim, perihal,
    ditandatangani, keterangan, created_by_email
  )
  VALUES (
    0, p_nomor_surat, p_tanggal_surat, p_pengirim, p_perihal,
    p_ditandatangani, p_keterangan, p_created_by_email
  )
  RETURNING id INTO new_id;

  PERFORM resequence_surat_keluar_by_tanggal();

  SELECT * INTO new_row FROM surat_keluar WHERE id = new_id;
  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_surat_keluar_sorted(
  text, date, text, text, boolean, text, text
) TO authenticated;

-- Fix numbering for rows that already exist in the live table.
SELECT resequence_surat_keluar_by_tanggal();
