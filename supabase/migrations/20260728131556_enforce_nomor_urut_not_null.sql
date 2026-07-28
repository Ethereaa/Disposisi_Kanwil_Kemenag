/*
# Enforce NOT NULL on nomor_urut columns

## Summary
The user's spec requires nomor_urut to be "tidak boleh kosong" (NOT NULL).
The existing tables already have data with no NULL values, so this is safe.
This migration adds NOT NULL constraints to surat_masuk.nomor_urut and
surat_keluar.nomor_urut to enforce the constraint going forward.

## Changes
1. surat_masuk.nomor_urut: added NOT NULL constraint
2. surat_keluar.nomor_urut: added NOT NULL constraint

## Notes
1. Verified zero existing NULL rows before applying (safe to run).
2. nomor_urut remains assigned by the application (getNextNomorUrut), not
   by a database sequence — the app computes "last number + 1" at insert
   time. This matches the spec: "mengambil nomor terakhir + 1".
*/

ALTER TABLE surat_masuk ALTER COLUMN nomor_urut SET NOT NULL;
ALTER TABLE surat_keluar ALTER COLUMN nomor_urut SET NOT NULL;
