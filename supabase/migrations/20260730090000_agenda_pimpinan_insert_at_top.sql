/*
# Insert-at-top behavior for Agenda Pimpinan

## Summary
Adds a database function that inserts a new agenda_pimpinan row at
nomor_urut = 1, shifting every existing row's nomor_urut up by 1 in the
same transaction. This keeps the most recently added agenda always at
the top of the list (nomor_urut 1), regardless of its event date.

Runs as SECURITY INVOKER (default) so the existing RLS policies on
agenda_pimpinan still apply — only authenticated users can call this.

## Why a database function instead of client-side updates
Shifting nomor_urut for every existing row from the client would mean
one network round-trip per row. Doing it as a single UPDATE + INSERT
inside one Postgres function makes it one round-trip and atomic (no
partial shifts if something fails midway).
*/

CREATE OR REPLACE FUNCTION insert_agenda_pimpinan_at_top(
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
  new_row agenda_pimpinan;
BEGIN
  UPDATE agenda_pimpinan SET nomor_urut = nomor_urut + 1;

  INSERT INTO agenda_pimpinan (
    nomor_urut, tanggal_kegiatan, waktu_kegiatan, nama_kegiatan,
    tempat_kegiatan, keterangan, disposisi_pegawai, created_by_email
  )
  VALUES (
    1, p_tanggal_kegiatan, p_waktu_kegiatan, p_nama_kegiatan,
    p_tempat_kegiatan, p_keterangan, p_disposisi_pegawai, p_created_by_email
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_agenda_pimpinan_at_top(
  date, text, text, text, text, text, text
) TO authenticated;
