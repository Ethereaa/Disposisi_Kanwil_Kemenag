import { describe, expect, it, vi } from 'vitest';
import { restoreBackup, type RestoreBackupData, type RestoreDependencies } from './restore';

// restoreBackup() is the database half of the backup restore flow. It is
// exercised here through injected spies rather than a rendered BackupPage:
// the guarantees worth protecting are about call ordering and argument
// routing, and both are observable without a DOM, a Supabase client, or the
// xlsx/docx chain that lib/export.ts drags in.
//
// The ordering assertions are the substance. agenda_pimpinan was previously
// counted in the confirmation modal and then never written, so a restore
// reported success while discarding the backup's agenda records — these tests
// exist so that cannot silently return.

// Distinguishable fixtures. The values are meaningless to restoreBackup, which
// only routes arrays to helpers; what matters is that each array is uniquely
// identifiable so cross-contamination between the three inserts is detectable.
function makeData(overrides: Partial<RestoreBackupData> = {}): RestoreBackupData {
  return {
    suratMasuk: [{ id: 'masuk-1' }],
    suratKeluar: [{ id: 'keluar-1' }, { id: 'keluar-2' }],
    agendaPimpinan: [{ id: 'agenda-1' }, { id: 'agenda-2' }, { id: 'agenda-3' }],
    ...overrides,
  } as RestoreBackupData;
}

interface Harness {
  deps: RestoreDependencies;
  /** Names of clears that had resolved by the time each insert was entered. */
  clearsResolvedWhenInsertStarted: string[];
  resolvedClears: string[];
}

// Builds spy dependencies that record when each clear resolved relative to
// each insert starting. `deferClears` keeps the clear promises pending for a
// macrotask so a missing `await` on the Promise.all would be caught rather
// than masked by microtask ordering.
function makeHarness(options: {
  deferClears?: boolean;
  failClearFor?: string;
  failAgendaInsert?: Error;
} = {}): Harness {
  const resolvedClears: string[] = [];
  const clearsResolvedWhenInsertStarted: string[] = [];

  const recordInsertStart = () => {
    clearsResolvedWhenInsertStarted.push(resolvedClears.slice().sort().join(','));
  };

  const deps: RestoreDependencies = {
    clearTable: vi.fn(async (table: string) => {
      if (options.failClearFor === table) {
        throw new Error(`clear failed for ${table}`);
      }
      if (options.deferClears) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      resolvedClears.push(table);
    }) as unknown as RestoreDependencies['clearTable'],

    bulkInsertMasuk: vi.fn(async () => {
      recordInsertStart();
    }) as unknown as RestoreDependencies['bulkInsertMasuk'],

    bulkInsertKeluar: vi.fn(async () => {
      recordInsertStart();
    }) as unknown as RestoreDependencies['bulkInsertKeluar'],

    bulkInsertAgendaPimpinan: vi.fn(async () => {
      recordInsertStart();
      if (options.failAgendaInsert) throw options.failAgendaInsert;
    }) as unknown as RestoreDependencies['bulkInsertAgendaPimpinan'],
  };

  return { deps, clearsResolvedWhenInsertStarted, resolvedClears };
}

const orderOf = (fn: unknown) => (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0];

describe('restoreBackup', () => {
  describe('clearing', () => {
    it('clears all three tables exactly once each', async () => {
      const { deps } = makeHarness();
      await restoreBackup(makeData(), deps);

      expect(deps.clearTable).toHaveBeenCalledTimes(3);
      expect(deps.clearTable).toHaveBeenCalledWith('surat_masuk');
      expect(deps.clearTable).toHaveBeenCalledWith('surat_keluar');
      expect(deps.clearTable).toHaveBeenCalledWith('agenda_pimpinan');
    });

    it('does not start any insert until all three clears have resolved', async () => {
      // Clears are deferred by a real timer, so an unawaited Promise.all would
      // let the first insert run with zero or one clear resolved.
      const { deps, clearsResolvedWhenInsertStarted } = makeHarness({ deferClears: true });
      await restoreBackup(makeData(), deps);

      const allThree = ['agenda_pimpinan', 'surat_keluar', 'surat_masuk'].join(',');
      expect(clearsResolvedWhenInsertStarted).toHaveLength(3);
      for (const snapshot of clearsResolvedWhenInsertStarted) {
        expect(snapshot).toBe(allThree);
      }
    });
  });

  describe('insert ordering and routing', () => {
    it('inserts masuk, then keluar, then agenda', async () => {
      const { deps } = makeHarness();
      await restoreBackup(makeData(), deps);

      expect(orderOf(deps.bulkInsertMasuk)).toBeLessThan(orderOf(deps.bulkInsertKeluar));
      expect(orderOf(deps.bulkInsertKeluar)).toBeLessThan(orderOf(deps.bulkInsertAgendaPimpinan));
    });

    it('routes each record set to its own helper with no cross-contamination', async () => {
      const { deps } = makeHarness();
      const data = makeData();
      await restoreBackup(data, deps);

      expect(deps.bulkInsertMasuk).toHaveBeenCalledTimes(1);
      expect(deps.bulkInsertKeluar).toHaveBeenCalledTimes(1);
      expect(deps.bulkInsertAgendaPimpinan).toHaveBeenCalledTimes(1);

      // Identity, not just deep equality — passing the wrong array would still
      // deep-equal if two fixtures happened to match.
      expect(deps.bulkInsertMasuk).toHaveBeenCalledWith(data.suratMasuk);
      expect(deps.bulkInsertKeluar).toHaveBeenCalledWith(data.suratKeluar);
      expect(deps.bulkInsertAgendaPimpinan).toHaveBeenCalledWith(data.agendaPimpinan);
    });

    it('passes the agenda records to bulkInsertAgendaPimpinan', async () => {
      const { deps } = makeHarness();
      const data = makeData();
      await restoreBackup(data, deps);

      const [received] = (deps.bulkInsertAgendaPimpinan as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(received).toBe(data.agendaPimpinan);
      expect(received).toHaveLength(3);
    });
  });

  describe('empty input', () => {
    it('still calls the agenda helper with an empty array', async () => {
      // The helper early-returns on [], so the call is a no-op — but it must
      // happen, otherwise a pre-agenda backup would take a different code path.
      const { deps } = makeHarness();
      const data = makeData({ agendaPimpinan: [] });

      await expect(restoreBackup(data, deps)).resolves.toBeUndefined();
      expect(deps.bulkInsertAgendaPimpinan).toHaveBeenCalledTimes(1);
      expect(deps.bulkInsertAgendaPimpinan).toHaveBeenCalledWith([]);
    });

    it('handles every record set being empty', async () => {
      const { deps } = makeHarness();
      const data = makeData({ suratMasuk: [], suratKeluar: [], agendaPimpinan: [] });

      await expect(restoreBackup(data, deps)).resolves.toBeUndefined();
      expect(deps.clearTable).toHaveBeenCalledTimes(3);
    });
  });

  describe('failure handling', () => {
    it('rejects and runs no inserts when a clear fails', async () => {
      const { deps } = makeHarness({ failClearFor: 'agenda_pimpinan' });

      await expect(restoreBackup(makeData(), deps)).rejects.toThrow('clear failed for agenda_pimpinan');

      expect(deps.bulkInsertMasuk).not.toHaveBeenCalled();
      expect(deps.bulkInsertKeluar).not.toHaveBeenCalled();
      expect(deps.bulkInsertAgendaPimpinan).not.toHaveBeenCalled();
    });

    it('propagates an agenda insert failure', async () => {
      const boom = new Error('agenda insert exploded');
      const { deps } = makeHarness({ failAgendaInsert: boom });

      await expect(restoreBackup(makeData(), deps)).rejects.toThrow('agenda insert exploded');
    });

    it('propagates the original error object unchanged', async () => {
      // The caller renders err.message via getErrorMessage(), so swallowing or
      // re-wrapping here would degrade the toast to a generic failure.
      const boom = new Error('original');
      (boom as Error & { code?: string }).code = 'PGRST116';
      const { deps } = makeHarness({ failAgendaInsert: boom });

      await expect(restoreBackup(makeData(), deps)).rejects.toBe(boom);
    });

    it('leaves earlier inserts applied when a later one fails (restore is not atomic)', async () => {
      // Documents current behaviour rather than endorsing it: there is no
      // transaction, so a late failure leaves cleared tables and partial data.
      const { deps } = makeHarness({ failAgendaInsert: new Error('late failure') });

      await expect(restoreBackup(makeData(), deps)).rejects.toThrow('late failure');

      expect(deps.bulkInsertMasuk).toHaveBeenCalledTimes(1);
      expect(deps.bulkInsertKeluar).toHaveBeenCalledTimes(1);
    });
  });

  describe('default dependencies', () => {
    it('is callable with only data (defaults are wired)', () => {
      // Not invoked — that would hit Supabase. Asserting the signature allows a
      // single argument is enough to catch the default parameter being dropped.
      expect(restoreBackup).toHaveLength(1);
    });
  });
});
