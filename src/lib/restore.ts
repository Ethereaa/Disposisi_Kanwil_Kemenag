import {
  bulkInsertAgendaPimpinan,
  bulkInsertKeluar,
  bulkInsertMasuk,
  clearTable,
} from './db';

// The record arrays are derived from the bulk-insert helpers rather than
// imported from the backup types. Those helpers are what actually consume the
// data, so deriving keeps this module honest if their signatures ever change,
// and it avoids pulling `BackupData` — and with it the xlsx/docx/file-saver
// chain in lib/export.ts — into anything that only needs to orchestrate a
// restore.
type MasukRecords = Parameters<typeof bulkInsertMasuk>[0];
type KeluarRecords = Parameters<typeof bulkInsertKeluar>[0];
type AgendaRecords = Parameters<typeof bulkInsertAgendaPimpinan>[0];

/**
 * The subset of a parsed backup that a restore actually writes. Deliberately
 * narrower than `BackupData`: `version` and `exportedAt` are display/validation
 * concerns owned by the parser and the confirmation modal, not by this step.
 */
export interface RestoreBackupData {
  suratMasuk: MasukRecords;
  suratKeluar: KeluarRecords;
  agendaPimpinan: AgendaRecords;
}

/**
 * Seam for tests. Production passes the real database helpers; tests pass
 * spies, which is what makes the ordering guarantees below assertable without
 * a Supabase client or a rendered component.
 */
export interface RestoreDependencies {
  clearTable: typeof clearTable;
  bulkInsertMasuk: typeof bulkInsertMasuk;
  bulkInsertKeluar: typeof bulkInsertKeluar;
  bulkInsertAgendaPimpinan: typeof bulkInsertAgendaPimpinan;
}

export const defaultDependencies: RestoreDependencies = {
  clearTable,
  bulkInsertMasuk,
  bulkInsertKeluar,
  bulkInsertAgendaPimpinan,
};

/**
 * Replaces every restorable table with the contents of a backup.
 *
 * All three tables are cleared before any insert begins. That barrier is the
 * point of the `Promise.all`: interleaving the clears with the inserts would
 * let a slow clear delete rows that had already been restored.
 *
 * agenda_pimpinan is included deliberately. It used to be counted in the
 * confirmation modal and then never written, so a restore reported success
 * while discarding the backup's agenda records and leaving the pre-existing
 * rows behind, out of sync with the freshly restored surat data.
 *
 * Errors propagate unchanged — the caller owns user-facing messaging. Note
 * that this is NOT atomic: there is no transaction and no rollback, so a
 * failure partway through leaves the database in a mixed state (tables
 * cleared, some inserts applied). Making it atomic would mean moving the
 * whole sequence into a single database function.
 */
export async function restoreBackup(
  data: RestoreBackupData,
  deps: RestoreDependencies = defaultDependencies,
): Promise<void> {
  await Promise.all([
    deps.clearTable('surat_masuk'),
    deps.clearTable('surat_keluar'),
    deps.clearTable('agenda_pimpinan'),
  ]);

  await deps.bulkInsertMasuk(data.suratMasuk);
  await deps.bulkInsertKeluar(data.suratKeluar);
  // parseBackup() normalizes a missing agendaPimpinan to [], and the helper
  // returns early on an empty array, so pre-agenda backups restore unchanged
  // rather than erroring.
  await deps.bulkInsertAgendaPimpinan(data.agendaPimpinan);
}
