import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_TARGET,
  buildPreviewQueries,
  isEligible,
  isProtectedDay,
  loadPreviewAgendas,
  selectPreviewAgendas,
  type PreviewAgenda,
  type PreviewQuery,
} from './agendaPreview';
import { dateProximityLabel } from './date';

// The Preview Agenda Pimpinan list used to fetch `nomor_urut ASC LIMIT 10`.
// nomor_urut is assigned newest-date-first by
// resequence_agenda_pimpinan_by_date(), so that query returned the ten
// agendas furthest in the FUTURE and dropped Hari ini / Besok / Lusa
// entirely once the table held more than ten rows. These tests exist so
// that class of silent disappearance cannot come back — including via the
// tempting non-fix of only raising the limit.
//
// Every boundary here is expressed in WITA (UTC+8), because that is the day
// boundary the preview follows rather than the visitor's device timezone.
//
// Eligibility is the WITA calendar date and nothing else: an agenda dated
// today stays listed for the whole day even after its scheduled time, and
// leaves only when the date rolls over. An earlier rule expired today's rows
// at their own clock time, which the office read as agendas vanishing during
// the working day. Several assertions below are deliberately inverted from
// that rule and say so where they are.

// Monday 10 Aug 2026, 10:00 WITA. Fixed so the suite cannot rot.
const NOW = '2026-08-10T02:00:00Z';
const NOW_MS = new Date(NOW).getTime();

const TODAY = '2026-08-10';
const BESOK = '2026-08-11';
const LUSA = '2026-08-12';
const KEMARIN = '2026-08-09';

// The same Monday at 16:30 WITA (08:30 UTC). The approved rule is about
// agendas whose time has already gone by, so the cases that prove it need a
// clock late enough for a normal working day to be behind it.
const AFTERNOON_MS = new Date('2026-08-10T08:30:00Z').getTime();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterAll(() => {
  vi.useRealTimers();
});

let seq = 0;

// nomorUrut deliberately does NOT follow chronology by default: the
// production column counts down from the furthest-future row, so fixtures
// that numbered themselves in date order would hide the bug under test.
function agenda(
  tanggalKegiatan: string | null,
  waktuKegiatan = '09:00',
  nomorUrut = ++seq,
): PreviewAgenda & { id: string } {
  return {
    id: `${tanggalKegiatan}-${waktuKegiatan}-${nomorUrut}`,
    tanggalKegiatan,
    waktuKegiatan,
    nomorUrut,
  };
}

/** n agendas on consecutive days starting `startOffset` days from today. */
function futureRun(startOffset: number, n: number): Array<PreviewAgenda & { id: string }> {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 10 + startOffset + i));
    return agenda(d.toISOString().slice(0, 10));
  });
}

/**
 * n agendas on one day, `stepMinutes` apart, starting `startMinutes` past
 * midnight. Throws rather than wrapping past midnight — a fixture that
 * silently produced '25:00' would be testing something other than what it
 * claims to.
 */
function dayRunFrom(
  iso: string,
  n: number,
  startMinutes: number,
  stepMinutes: number,
): Array<PreviewAgenda & { id: string }> {
  const last = startMinutes + (n - 1) * stepMinutes;
  if (last > 23 * 60 + 59) {
    throw new Error(`fixture spills past midnight: ${n} rows from ${startMinutes}m every ${stepMinutes}m`);
  }
  return Array.from({ length: n }, (_, i) => {
    const m = startMinutes + i * stepMinutes;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return agenda(iso, `${hh}:${mm}`);
  });
}

/** n agendas on one day at quarter-hour intervals from `startHour`. */
function dayRun(iso: string, n: number, startHour: number): Array<PreviewAgenda & { id: string }> {
  return dayRunFrom(iso, n, startHour * 60, 15);
}

/**
 * n agendas on `iso` whose scheduled time is already behind the 10:00 WITA
 * clock. Minute-apart from 00:15, which keeps every row strictly before
 * 10:00 and off minute 0, so ordering assertions can still tell these apart
 * from genuine all-day rows. Under the approved rule they stay eligible —
 * the name describes their clock time, not their eligibility.
 */
function passedTimeRun(iso: string, n: number): Array<PreviewAgenda & { id: string }> {
  return dayRunFrom(iso, n, 15, 1);
}

/**
 * Renumbers a fixture the way the database does:
 * resequence_agenda_pimpinan_by_date() assigns nomor_urut over
 * `tanggal_kegiatan DESC`, so 1 is the furthest-future row. Tests that make
 * a claim about nomor_urut must use this, otherwise they are numbering rows
 * in an order production never produces.
 */
function withProductionNomorUrut<T extends PreviewAgenda>(items: T[]): T[] {
  return [...items]
    .sort((a, b) => (b.tanggalKegiatan ?? '').localeCompare(a.tanggalKegiatan ?? ''))
    .map((item, i) => ({ ...item, nomorUrut: i + 1 }));
}

/** Asserts the list is in date-then-time order. */
function expectChronological(rows: PreviewAgenda[]) {
  const keys = rows.map((r) => `${r.tanggalKegiatan} ${r.waktuKegiatan}`);
  expect(keys).toEqual([...keys].sort());
}

describe('isEligible', () => {
  it('keeps a future agenda', () => {
    expect(isEligible(agenda(BESOK), NOW_MS)).toBe(true);
  });

  it('drops a past agenda', () => {
    expect(isEligible(agenda(KEMARIN), NOW_MS)).toBe(false);
  });

  it('drops an agenda with no date', () => {
    expect(isEligible(agenda(null), NOW_MS)).toBe(false);
  });

  // The approved rule: eligibility is the WITA calendar date alone. Anything
  // dated today stays for the whole day, however long ago it was scheduled.
  // These are the cases the office reported as agendas disappearing mid-day.
  describe("today's agendas, whatever the clock says", () => {
    it.each([
      ['first thing in the morning', '07:00'],
      ['mid-morning', '09:00'],
      ['just before the clock', '16:29'],
      ['early afternoon', '13:30'],
      ['on the clock exactly', '16:30'],
      ['later tonight', '23:00'],
    ])('keeps one scheduled %s', (_label, waktu) => {
      expect(isEligible(agenda(TODAY, waktu), AFTERNOON_MS)).toBe(true);
    });

    it('still keeps upcoming ones, as it always did', () => {
      expect(isEligible(agenda(TODAY, '14:30'), NOW_MS)).toBe(true);
      expect(isEligible(agenda(TODAY, '10:00'), NOW_MS)).toBe(true);
    });

    // This assertion is inverted from the original rule, which expired a row
    // at its own scheduled time. Kept as a named case so a future change
    // back to time-based expiry cannot pass silently.
    it('keeps one whose time has already gone by', () => {
      expect(isEligible(agenda(TODAY, '09:59'), NOW_MS)).toBe(true);
    });

    // waktu_kegiatan is `text NOT NULL DEFAULT '00:00'`, so these are the
    // real-world values an all-day or hand-edited row can carry. None of
    // them can affect eligibility now, which is the point: a malformed time
    // field cannot hide an agenda.
    it.each([
      ['the schema default', '00:00'],
      ['an empty string', ''],
      ['whitespace', '   '],
      ['unparseable text', 'pagi'],
      ['an impossible hour', '99:99'],
    ])('keeps a row whose time is %s', (_label, waktu) => {
      expect(isEligible(agenda(TODAY, waktu), AFTERNOON_MS)).toBe(true);
    });
  });

  // The other half of the rule: the day boundary is the only thing that
  // expires an agenda, so yesterday goes even at one minute to midnight.
  describe('the previous calendar day', () => {
    it.each([
      ['last thing at night', '23:59'],
      ['an all-day row', '00:00'],
      ['a blank time', ''],
    ])('drops yesterday %s', (_label, waktu) => {
      expect(isEligible(agenda(KEMARIN, waktu), AFTERNOON_MS)).toBe(false);
    });
  });
});

describe('isProtectedDay', () => {
  it.each([
    ['hari ini', TODAY],
    ['besok', BESOK],
    ['lusa', LUSA],
  ])('protects %s', (_label, iso) => {
    expect(isProtectedDay(agenda(iso), NOW_MS)).toBe(true);
  });

  it.each([
    ['the day after lusa', '2026-08-13'],
    ['a far future date', '2026-12-01'],
    ['yesterday', '2026-08-09'],
  ])('does not protect %s', (_label, iso) => {
    expect(isProtectedDay(agenda(iso), NOW_MS)).toBe(false);
  });

  it('does not protect a null date', () => {
    expect(isProtectedDay(agenda(null), NOW_MS)).toBe(false);
  });
});

describe('selectPreviewAgendas', () => {
  // Required case 9.
  it('returns everything when fewer than the target are eligible', () => {
    const items = [agenda(BESOK), agenda(TODAY, '15:00'), agenda(LUSA)];
    const result = selectPreviewAgendas(items, NOW_MS);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.tanggalKegiatan)).toEqual([TODAY, BESOK, LUSA]);
  });

  // Required case 1 — the hard maximum, from several directions.
  describe('never exceeds the hard maximum of 15', () => {
    it.each([
      ['a pure future flood', () => futureRun(3, 40)],
      ['a single overloaded today', () => dayRun(TODAY, 40, 11)],
      ['every protected day overloaded', () => [
        ...dayRun(TODAY, 20, 11),
        ...dayRun(BESOK, 20, 8),
        ...dayRun(LUSA, 20, 8),
      ]],
      ['protected days plus a future flood', () => [
        ...dayRun(TODAY, 20, 11),
        ...dayRun(BESOK, 20, 8),
        ...dayRun(LUSA, 20, 8),
        ...futureRun(3, 40),
      ]],
      ['passed-time today rows mixed in', () => [
        ...passedTimeRun(TODAY, 30),
        ...dayRun(TODAY, 10, 11),
        ...futureRun(3, 20),
      ]],
    ])('caps %s at 15', (_label, build) => {
      const result = selectPreviewAgendas(build(), NOW_MS);

      expect(result.length).toBeLessThanOrEqual(PREVIEW_TARGET);
      expect(result).toHaveLength(PREVIEW_TARGET);
    });
  });

  // Required case 2 — the exact example from the review.
  describe('20 hari ini + 1 besok + 1 lusa', () => {
    const rows = [...dayRun(TODAY, 20, 11), agenda(BESOK, '08:00'), agenda(LUSA, '08:00')];

    it('returns at most 15, not 22', () => {
      expect(selectPreviewAgendas(rows, NOW_MS)).toHaveLength(PREVIEW_TARGET);
    });

    it('still represents besok and lusa', () => {
      const dates = selectPreviewAgendas(rows, NOW_MS).map((r) => r.tanggalKegiatan);

      expect(dates).toContain(TODAY);
      expect(dates).toContain(BESOK);
      expect(dates).toContain(LUSA);
    });

    it("caps today at 13 so the other two days fit", () => {
      const dates = selectPreviewAgendas(rows, NOW_MS).map((r) => r.tanggalKegiatan);

      expect(dates.filter((d) => d === TODAY)).toHaveLength(13);
      expect(dates.filter((d) => d === BESOK)).toHaveLength(1);
      expect(dates.filter((d) => d === LUSA)).toHaveLength(1);
    });

    it('keeps the earliest of today, not an arbitrary subset', () => {
      const result = selectPreviewAgendas(rows, NOW_MS);

      expect(result[0].waktuKegiatan).toBe('11:00');
      expect(result[12].waktuKegiatan).toBe('14:00');
    });

    // Required case 10.
    it('renders chronologically', () => {
      expectChronological(selectPreviewAgendas(rows, NOW_MS));
    });
  });

  // The same shape as above, but every one of today's 20 rows is already
  // behind the clock. This is the risk the approved rule introduces: those
  // rows used to be discarded before selection ran, so they could not
  // compete for slots. Now they can, and Besok/Lusa must still survive.
  describe('20 passed-time hari ini + 1 besok + 1 lusa', () => {
    // 07:00 to 11:45, all behind the 16:30 WITA clock.
    const rows = [...dayRun(TODAY, 20, 7), agenda(BESOK, '08:00'), agenda(LUSA, '08:00')];

    it('still caps at exactly 13 + 1 + 1 = 15', () => {
      const dates = selectPreviewAgendas(rows, AFTERNOON_MS).map((r) => r.tanggalKegiatan);

      expect(dates.filter((d) => d === TODAY)).toHaveLength(13);
      expect(dates.filter((d) => d === BESOK)).toHaveLength(1);
      expect(dates.filter((d) => d === LUSA)).toHaveLength(1);
      expect(dates).toHaveLength(PREVIEW_TARGET);
    });

    it('keeps the earliest 13 of today, not the last 13', () => {
      const result = selectPreviewAgendas(rows, AFTERNOON_MS);

      expect(result[0].waktuKegiatan).toBe('07:00');
      expect(result[12].waktuKegiatan).toBe('10:00');
    });

    it('renders chronologically', () => {
      expectChronological(selectPreviewAgendas(rows, AFTERNOON_MS));
    });
  });

  it('gives every protected day a slot even at target 3', () => {
    const rows = [...dayRun(TODAY, 20, 11), agenda(BESOK, '08:00'), agenda(LUSA, '08:00')];
    const result = selectPreviewAgendas(rows, NOW_MS, 3);

    expect(result.map((r) => r.tanggalKegiatan)).toEqual([TODAY, BESOK, LUSA]);
  });

  it('does not reserve slots for protected days that have no agendas', () => {
    // No besok, no lusa: today and the filler take everything.
    const rows = [...dayRun(TODAY, 5, 11), ...futureRun(3, 20)];
    const result = selectPreviewAgendas(rows, NOW_MS);

    expect(result).toHaveLength(PREVIEW_TARGET);
    expect(result.filter((r) => r.tanggalKegiatan === TODAY)).toHaveLength(5);
  });

  it('orders chronologically, not by nomorUrut', () => {
    // nomorUrut descending as date ascends — the production arrangement.
    const items = [agenda(LUSA, '09:00', 1), agenda(TODAY, '14:00', 3), agenda(BESOK, '09:00', 2)];

    expect(selectPreviewAgendas(items, NOW_MS).map((r) => r.tanggalKegiatan))
      .toEqual([TODAY, BESOK, LUSA]);
  });

  it('sorts same-day agendas by time of day', () => {
    const items = [agenda(TODAY, '16:00'), agenda(TODAY, '11:00'), agenda(TODAY, '13:00')];

    expect(selectPreviewAgendas(items, NOW_MS).map((r) => r.waktuKegiatan))
      .toEqual(['11:00', '13:00', '16:00']);
  });

  // Retaining passed-time rows must not reorder the day. A "finished" row
  // keeps its clock position rather than sinking below the upcoming ones,
  // and all-day rows still lead the day as they always have.
  it('does not sort passed-time rows after upcoming ones', () => {
    const items = [
      agenda(TODAY, '18:00'),
      agenda(TODAY, '07:00'),
      agenda(TODAY, ''),
      agenda(TODAY, '13:30'),
      agenda(TODAY, '23:00'),
      agenda(TODAY, '09:00'),
    ];

    expect(selectPreviewAgendas(items, AFTERNOON_MS).map((r) => r.waktuKegiatan))
      .toEqual(['', '07:00', '09:00', '13:30', '18:00', '23:00']);
  });

  it('keeps the nomorUrut tiebreak for rows at the same passed time', () => {
    const items = [agenda(TODAY, '08:00', 7), agenda(TODAY, '08:00', 3), agenda(TODAY, '08:00', 5)];

    expect(selectPreviewAgendas(items, AFTERNOON_MS).map((r) => r.nomorUrut)).toEqual([3, 5, 7]);
  });

  it('excludes past and dateless rows', () => {
    const items = [agenda('2026-08-01'), agenda(null), agenda(TODAY, '08:00'), agenda(BESOK)];

    // 08:00 is behind the 10:00 WITA clock and stays: only the earlier
    // calendar date and the dateless row are excluded.
    expect(selectPreviewAgendas(items, NOW_MS).map((r) => r.tanggalKegiatan))
      .toEqual([TODAY, BESOK]);
  });

  // Required case 3.
  describe('a future flood cannot push out the near days', () => {
    // Numbered exactly as the database would: the 40 far rows take
    // nomor_urut 1..40 and the three near days come last.
    const rows = withProductionNomorUrut([
      agenda(TODAY, '14:00'),
      agenda(BESOK),
      agenda(LUSA),
      ...futureRun(3, 40),
    ]);

    it('keeps hari ini, besok and lusa present', () => {
      const dates = selectPreviewAgendas(rows, NOW_MS).map((r) => r.tanggalKegiatan);

      expect(dates).toContain(TODAY);
      expect(dates).toContain(BESOK);
      expect(dates).toContain(LUSA);
    });

    it('puts them first, in day order', () => {
      expect(selectPreviewAgendas(rows, NOW_MS).slice(0, 3).map((r) => r.tanggalKegiatan))
        .toEqual([TODAY, BESOK, LUSA]);
    });

    it('fills the rest with the nearest remaining agendas', () => {
      const result = selectPreviewAgendas(rows, NOW_MS);

      expect(result).toHaveLength(PREVIEW_TARGET);
      // The 12 fillers are the nearest of the flood, not the furthest.
      expect(result[3].tanggalKegiatan).toBe('2026-08-13');
      expect(result[PREVIEW_TARGET - 1].tanggalKegiatan).toBe('2026-08-24');
      expectChronological(result);
    });

    // Guards the non-fix: raising the limit from 10 to 15 without inverting
    // the ordering leaves the near days just as absent. This reproduces the
    // old query — `nomor_urut ASC LIMIT 15` — against the same rows.
    it('would not be fixed by a larger limit alone', () => {
      const naive = [...rows]
        .sort((a, b) => a.nomorUrut - b.nomorUrut)
        .slice(0, PREVIEW_TARGET)
        .map((r) => r.tanggalKegiatan);

      expect(naive).not.toContain(TODAY);
      expect(naive).not.toContain(BESOK);
      expect(naive).not.toContain(LUSA);
      expect(selectPreviewAgendas(rows, NOW_MS).map((r) => r.tanggalKegiatan)).toContain(TODAY);
    });
  });

  it("keeps today's finished agendas alongside its upcoming ones", () => {
    // The whole point of the approved rule: at 16:30 WITA a 07:00 meeting is
    // still on the list, in its own chronological place — not moved, not
    // grouped, not dropped.
    const items = [
      agenda(TODAY, '07:00'),
      agenda(TODAY, '09:30'),
      agenda(TODAY, '11:00'),
      agenda(TODAY, '16:00'),
      agenda(TODAY, '18:00'),
      agenda(TODAY, '23:00'),
    ];

    expect(selectPreviewAgendas(items, AFTERNOON_MS).map((r) => r.waktuKegiatan))
      .toEqual(['07:00', '09:30', '11:00', '16:00', '18:00', '23:00']);
  });

  it('returns an empty list when nothing is eligible', () => {
    expect(selectPreviewAgendas([agenda('2026-01-01'), agenda(null)], NOW_MS)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const items = [agenda(LUSA, '09:00', 1), agenda(TODAY, '14:00', 2)];
    const snapshot = items.map((r) => r.id);
    selectPreviewAgendas(items, NOW_MS);

    expect(items.map((r) => r.id)).toEqual(snapshot);
  });
});

// --- Fetch plan -------------------------------------------------------

describe('buildPreviewQueries', () => {
  const queries = buildPreviewQueries(NOW_MS);

  it('covers today, besok, lusa and later in four bounded queries', () => {
    expect(queries).toEqual([
      { kind: 'day', date: TODAY, limit: PREVIEW_TARGET },
      { kind: 'day', date: BESOK, limit: PREVIEW_TARGET },
      { kind: 'day', date: LUSA, limit: PREVIEW_TARGET },
      { kind: 'after', date: LUSA, limit: PREVIEW_TARGET },
    ]);
    expect(queries).toHaveLength(4);
  });

  // Load-bearing: today used to be fetched as two halves split on the
  // current WITA time. A lower bound there would leave this morning's
  // agendas on the server, so no amount of client-side eligibility could
  // put them back. Asserted directly rather than only via toEqual above, so
  // the reason survives if the plan is ever extended.
  it('puts no time bound on any query, so a whole day is always fetched', () => {
    expect(queries.some((q) => q.timeFrom !== undefined)).toBe(false);
    expect(queries.some((q) => q.timeBefore !== undefined)).toBe(false);
  });

  it('bounds every query, so total rows fetched cannot grow with table size', () => {
    expect(queries.every((q) => q.limit === PREVIEW_TARGET)).toBe(true);
    expect(queries.reduce((sum, q) => sum + q.limit, 0)).toBe(4 * PREVIEW_TARGET);
  });

  it('pins each protected day by exact date so days cannot compete for budget', () => {
    const dayQueries = queries.filter((q) => q.kind === 'day');

    expect(dayQueries.map((q) => q.date)).toEqual([TODAY, BESOK, LUSA]);
  });
});

describe('loadPreviewAgendas', () => {
  /**
   * Stands in for Postgres: applies the same filters runAgendaPreviewQuery
   * builds, so the fetch plan is tested against the semantics it will really
   * meet — including `waktu_kegiatan` being compared as text.
   */
  function fakeTable(rows: Array<PreviewAgenda & { id: string }>) {
    const calls: PreviewQuery[] = [];
    const run = async (q: PreviewQuery) => {
      calls.push(q);
      return rows
        .filter((r) => r.tanggalKegiatan !== null)
        .filter((r) => (q.kind === 'day' ? r.tanggalKegiatan === q.date : (r.tanggalKegiatan ?? '') > q.date))
        .filter((r) => q.timeFrom === undefined || r.waktuKegiatan >= q.timeFrom)
        .filter((r) => q.timeBefore === undefined || r.waktuKegiatan < q.timeBefore)
        .sort((a, b) =>
          (a.tanggalKegiatan ?? '').localeCompare(b.tanggalKegiatan ?? '') ||
          a.waktuKegiatan.localeCompare(b.waktuKegiatan))
        .slice(0, q.limit);
    };
    return { run, calls };
  }

  // Required case 4 — the correctness hole the old single 60-row window had.
  describe('a hari ini buried under 200 passed-time rows', () => {
    // Under the pre-fix single-window plan these 200 filled the whole budget
    // and besok/lusa never arrived. They now stay eligible as well, so they
    // also compete for selection slots — the per-day query and the slot
    // reservation are what still get the other days through.
    const rows = [
      ...passedTimeRun(TODAY, 200),
      agenda(TODAY, '15:00'),
      agenda(BESOK, '08:00'),
      agenda(LUSA, '08:00'),
      ...futureRun(3, 50),
    ];

    it('still fetches besok and lusa', async () => {
      const { run } = fakeTable(rows);
      const fetched = await loadPreviewAgendas(run, NOW_MS);
      const dates = fetched.map((r) => r.tanggalKegiatan);

      expect(dates).toContain(BESOK);
      expect(dates).toContain(LUSA);
    });

    it('still represents besok and lusa after selection', async () => {
      const { run } = fakeTable(rows);
      const result = selectPreviewAgendas(await loadPreviewAgendas(run, NOW_MS), NOW_MS);
      const dates = result.map((r) => r.tanggalKegiatan);

      expect(result).toHaveLength(PREVIEW_TARGET);
      expect(dates).toContain(TODAY);
      expect(dates).toContain(BESOK);
      expect(dates).toContain(LUSA);
      expectChronological(result);
    });

    it('caps today at 13 and takes its earliest rows', async () => {
      const { run } = fakeTable(rows);
      const result = selectPreviewAgendas(await loadPreviewAgendas(run, NOW_MS), NOW_MS);
      const today = result.filter((r) => r.tanggalKegiatan === TODAY);

      expect(today).toHaveLength(13);
      expect(today[0].waktuKegiatan).toBe('00:15');
      expect(result.filter((r) => r.tanggalKegiatan === BESOK)).toHaveLength(1);
      expect(result.filter((r) => r.tanggalKegiatan === LUSA)).toHaveLength(1);
    });

    it('fetches a bounded number of rows regardless of table size', async () => {
      const { run } = fakeTable([...rows, ...passedTimeRun(TODAY, 300)]);
      const fetched = await loadPreviewAgendas(run, NOW_MS);

      expect(fetched.length).toBeLessThanOrEqual(4 * PREVIEW_TARGET);
    });
  });

  it('collects all-day rows at the head of a day full of passed-time ones', async () => {
    // '' and '00:00' sort below every clock time, so an ascending page always
    // reaches them first. That is why today is fetched ascending rather than
    // from the current clock onwards.
    const { run } = fakeTable([
      agenda(TODAY, '', 1),
      agenda(TODAY, '00:00', 2),
      ...passedTimeRun(TODAY, 30),
    ]);
    const result = selectPreviewAgendas(await loadPreviewAgendas(run, NOW_MS), NOW_MS);

    expect(result.slice(0, 2).map((r) => r.waktuKegiatan)).toEqual(['', '00:00']);
    expect(result).toHaveLength(PREVIEW_TARGET);
  });

  it('issues exactly the planned queries', async () => {
    const { run, calls } = fakeTable([agenda(TODAY, '14:00')]);
    await loadPreviewAgendas(run, NOW_MS);

    expect(calls).toEqual(buildPreviewQueries(NOW_MS));
  });

  it('dedupes by id', async () => {
    const dup = agenda(BESOK, '08:00');
    const run = async () => [dup];
    const fetched = await loadPreviewAgendas(run, NOW_MS);

    expect(fetched).toHaveLength(1);
  });

  it('returns nothing when the table is empty', async () => {
    const { run } = fakeTable([]);

    expect(await loadPreviewAgendas(run, NOW_MS)).toEqual([]);
  });
});

// --- WITA consistency -------------------------------------------------

// The WITA boundary matters most in the 00:00-07:59 WITA window, where the
// WITA calendar day is one ahead of the UTC one. A browser-local or UTC
// reading of "today" there shifts every protected day by one, so today's
// agendas would be treated as yesterday's and dropped.
describe('WITA day boundary', () => {
  // Required case 7.
  it('treats 00:30 WITA as the new day', () => {
    // Mon 10 Aug 00:30 WITA = Sun 9 Aug 16:30 UTC.
    const earlyMs = new Date('2026-08-09T16:30:00Z').getTime();

    expect(isProtectedDay(agenda(TODAY), earlyMs)).toBe(true);
    expect(isEligible(agenda(TODAY, '09:00'), earlyMs)).toBe(true);
    expect(isProtectedDay(agenda(KEMARIN), earlyMs)).toBe(false);
    expect(buildPreviewQueries(earlyMs)[0]).toEqual({
      kind: 'day', date: TODAY, limit: PREVIEW_TARGET,
    });
  });

  it('treats 23:30 WITA as still the same day', () => {
    // Mon 10 Aug 23:30 WITA = Mon 10 Aug 15:30 UTC.
    const lateMs = new Date('2026-08-10T15:30:00Z').getTime();

    expect(isProtectedDay(agenda(TODAY), lateMs)).toBe(true);
    // 09:00 has long passed by 23:30 WITA and is kept anyway — the day, not
    // the clock, is what expires an agenda.
    expect(isEligible(agenda(TODAY, '09:00'), lateMs)).toBe(true);
    expect(isEligible(agenda(TODAY, '00:00'), lateMs)).toBe(true);
  });

  // The last minute of the WITA day: nothing dated today has expired yet.
  it('keeps every one of the day\'s agendas at 23:59 WITA', () => {
    // Mon 10 Aug 23:59 WITA = Mon 10 Aug 15:59 UTC.
    const lastMinuteMs = new Date('2026-08-10T15:59:00Z').getTime();
    const items = ['', '00:00', '07:00', '13:30', '18:00', '23:00', '23:58']
      .map((waktu) => agenda(TODAY, waktu));

    expect(items.every((item) => isEligible(item, lastMinuteMs))).toBe(true);
    expect(selectPreviewAgendas(items, lastMinuteMs)).toHaveLength(items.length);
  });

  it('rolls the protected window over at WITA midnight', () => {
    // Tue 11 Aug 00:10 WITA = Mon 10 Aug 16:10 UTC. Besok becomes today.
    const afterMidnightMs = new Date('2026-08-10T16:10:00Z').getTime();

    expect(isProtectedDay(agenda(BESOK), afterMidnightMs)).toBe(true);
    expect(isProtectedDay(agenda('2026-08-13'), afterMidnightMs)).toBe(true);
    expect(isEligible(agenda(TODAY, '23:00'), afterMidnightMs)).toBe(false);
    expect(buildPreviewQueries(afterMidnightMs).map((q) => q.date))
      .toEqual([BESOK, LUSA, '2026-08-13', '2026-08-13']);
  });

  // The other side of the 23:59 case: one minute later the whole day goes,
  // including the rows that were still eligible a moment before.
  it('drops the whole previous day the instant WITA midnight passes', () => {
    // Tue 11 Aug 00:00 WITA = Mon 10 Aug 16:00 UTC.
    const midnightMs = new Date('2026-08-10T16:00:00Z').getTime();
    const items = ['', '00:00', '07:00', '18:00', '23:00', '23:59']
      .map((waktu) => agenda(TODAY, waktu));

    expect(items.some((item) => isEligible(item, midnightMs))).toBe(false);
    expect(selectPreviewAgendas(items, midnightMs)).toEqual([]);
  });

  it('resolves the protected window from real time when nowMs is omitted', () => {
    // Fake timers are set to NOW, so the default parameter must agree with
    // the explicit form. Same array both times, so ids cannot differ.
    const items = [agenda(TODAY, '14:00'), agenda(BESOK), agenda('2026-09-30')];

    expect(selectPreviewAgendas(items)).toEqual(selectPreviewAgendas(items, NOW_MS));
    expect(buildPreviewQueries()).toEqual(buildPreviewQueries(NOW_MS));
  });
});

// Required case 8. The preview passes witaTodayISO() as the badge reference,
// so the chip is derived from the same WITA day the selection used. These
// assert the classification is a pure function of that reference and cannot
// drift with the device timezone — the reason the badge takes an override at
// all. The suite runs under UTC, Asia/Makassar and America/New_York via
// `npm run test:tz`, so these run against three different local timezones.
describe('preview badge day classification', () => {
  it.each([
    ['hari ini', TODAY, 'Hari Ini'],
    ['besok', BESOK, 'Besok'],
    ['lusa', LUSA, 'Lusa'],
  ])('labels %s from the WITA reference', (_label, iso, expected) => {
    expect(dateProximityLabel(iso, TODAY)).toBe(expected);
  });

  it.each([
    ['yesterday', '2026-08-09'],
    ['the day after lusa', '2026-08-13'],
  ])('labels %s as nothing', (_label, iso) => {
    expect(dateProximityLabel(iso, TODAY)).toBeNull();
  });

  it('agrees with the selection for every row the preview renders', () => {
    const rows = [agenda(TODAY, '14:00'), agenda(BESOK), agenda(LUSA), ...futureRun(3, 20)];
    const result = selectPreviewAgendas(rows, NOW_MS);
    const todayWITA = TODAY; // what AgendaPreviewHome passes as referenceISO

    for (const row of result) {
      const label = dateProximityLabel(row.tanggalKegiatan, todayWITA);
      // A row is badged exactly when the selection considers it protected.
      expect(label !== null).toBe(isProtectedDay(row, NOW_MS));
    }
  });

  it('is unaffected by the local timezone, unlike the browser-local default', () => {
    // 03:00 WITA on 10 Aug = 19:00 UTC on 9 Aug. A device on UTC (or New
    // York) reads "today" as 9 Aug while WITA is already on the 10th. With
    // the WITA reference the row is Hari Ini; with the device's own day it
    // would read as Besok — the inconsistency this override removes.
    const earlyMs = new Date('2026-08-09T19:00:00Z').getTime();
    const witaToday = TODAY;

    expect(dateProximityLabel(TODAY, witaToday)).toBe('Hari Ini');
    expect(isProtectedDay(agenda(TODAY), earlyMs)).toBe(true);
    expect(dateProximityLabel(TODAY, '2026-08-09')).toBe('Besok');
  });

  it('crosses a month end correctly', () => {
    expect(dateProximityLabel('2026-09-01', '2026-08-31')).toBe('Besok');
    expect(dateProximityLabel('2026-09-02', '2026-08-31')).toBe('Lusa');
  });

  it('returns null for missing input', () => {
    expect(dateProximityLabel(null, TODAY)).toBeNull();
    expect(dateProximityLabel(undefined, TODAY)).toBeNull();
    expect(dateProximityLabel(TODAY, '')).toBeNull();
    expect(dateProximityLabel(TODAY, 'not-a-date')).toBeNull();
  });
});
