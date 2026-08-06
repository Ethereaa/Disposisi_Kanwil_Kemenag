import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { businessDaysSince } from './date';

// businessDaysSince() resolves calendar-day boundaries in WITA (UTC+8), not
// in the host timezone. That matters because an identical copy of it lives in
// supabase/functions/send-surat-overdue-reminders/index.ts and decides who
// receives an overdue push notification, while this copy decides what the UI
// flags as overdue. They run on different hosts (UTC edge runtime vs. the
// user's browser), so anything that reads host-local time makes the two
// disagree — a notification fires while the record shows as on-time, and the
// reminder log then suppresses it forever.
//
// Every stamp below is written as UTC with its WITA equivalent in a comment,
// since the WITA reading is what the function actually reasons about.

// Monday 10 Aug 2026, 10:00 WITA. Fixed so the suite cannot rot.
const NOW = '2026-08-10T02:00:00Z';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('businessDaysSince', () => {
  // The 00:00-07:59 WITA window is the regression this suite exists for: a
  // stamp in it belongs to the PREVIOUS UTC calendar day, so host-local
  // arithmetic on a UTC box counts one extra weekday.
  describe('timestamps between 00:00 and 07:59 WITA', () => {
    it.each([
      ['2026-08-06T23:00:00Z', 'Fri 7 Aug 07:00 WITA'],
      ['2026-08-06T16:00:00Z', 'Fri 7 Aug 00:00 WITA'],
      ['2026-08-06T20:30:00Z', 'Fri 7 Aug 04:30 WITA'],
    ])('%s (%s) counts only Monday', (iso) => {
      // Fri -> Mon: Sat and Sun are skipped, Mon is the single elapsed weekday.
      // Pre-fix this returned 2 on a UTC host, because the stamp truncated to
      // Thursday and Friday was counted as well.
      expect(businessDaysSince(iso)).toBe(1);
    });
  });

  describe('normal daytime WITA timestamps', () => {
    it('counts one weekday for Friday 10:00 WITA', () => {
      expect(businessDaysSince('2026-08-07T02:00:00Z')).toBe(1);
    });

    it('counts zero for earlier the same WITA day', () => {
      // Mon 10 Aug 09:00 WITA — same day as NOW, so no full day has elapsed.
      expect(businessDaysSince('2026-08-10T01:00:00Z')).toBe(0);
    });
  });

  describe('Friday, Saturday and Sunday boundaries', () => {
    it('does not count the weekend after a Friday evening stamp', () => {
      // Fri 7 Aug 17:00 WITA.
      expect(businessDaysSince('2026-08-07T09:00:00Z')).toBe(1);
    });

    it('counts one weekday from a Saturday stamp', () => {
      // Sat 8 Aug 12:00 WITA — only Mon counts.
      expect(businessDaysSince('2026-08-08T04:00:00Z')).toBe(1);
    });

    it('counts one weekday from a Sunday stamp', () => {
      // Sun 9 Aug 12:00 WITA — only Mon counts.
      expect(businessDaysSince('2026-08-09T04:00:00Z')).toBe(1);
    });

    it('treats a Saturday 01:00 WITA stamp as Saturday, not Friday', () => {
      // Sat 8 Aug 01:00 WITA = Fri 7 Aug 17:00 UTC. This is the worst case:
      // inside the divergence window AND across a weekend boundary. Host-local
      // arithmetic on a UTC box reads it as Friday and counts Friday too.
      expect(businessDaysSince('2026-08-07T17:00:00Z')).toBe(1);
    });
  });

  describe('null, undefined, empty, invalid and future input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['non-date text', 'not-a-date'],
      ['impossible date', '2026-13-45'],
    ])('returns 0 for %s', (_label, input) => {
      expect(businessDaysSince(input)).toBe(0);
    });

    it('returns 0 for a future timestamp', () => {
      // The loop condition is strict, so a stamp after NOW never enters it.
      expect(businessDaysSince('2026-08-20T02:00:00Z')).toBe(0);
    });
  });
});

// The host timezone is fixed before the process starts (see the test:tz
// script), so this block asserts the property rather than switching zones at
// runtime: under any TZ the numbers must be the ones asserted above. Running
// the suite under UTC, Asia/Makassar and America/New_York is what actually
// proves independence — America/New_York is the strongest case, being 12
// hours from WITA.
describe('timezone independence', () => {
  const CASES: Array<[string, number]> = [
    ['2026-08-06T23:00:00Z', 1], // Fri 7 Aug 07:00 WITA
    ['2026-08-06T16:00:00Z', 1], // Fri 7 Aug 00:00 WITA
    ['2026-08-07T02:00:00Z', 1], // Fri 7 Aug 10:00 WITA
    ['2026-08-07T17:00:00Z', 1], // Sat 8 Aug 01:00 WITA
    ['2026-08-10T01:00:00Z', 0], // Mon 10 Aug 09:00 WITA
  ];

  it.each(CASES)('%s is %i regardless of host timezone', (iso, expected) => {
    expect(businessDaysSince(iso)).toBe(expected);
  });

  it('reports the timezone it ran under', () => {
    // Not an assertion so much as a breadcrumb: if a run fails, the reporter
    // shows which zone produced it.
    const tz = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(typeof tz).toBe('string');
  });
});

// The two copies of businessDaysSince are kept in sync by a comment, which
// nothing enforces. This guard turns that comment into a failing test: it
// compares the implementations character-for-character (whitespace and the
// `export` keyword aside) and fails the moment one is edited without the
// other. It does not execute the edge copy — that runs under Deno with npm:
// specifiers and a top-level Deno.serve(), so it cannot be imported here.
describe('source parity with the edge function copy', () => {
  const CLIENT_PATH = fileURLToPath(new URL('./date.ts', import.meta.url));
  const EDGE_PATH = fileURLToPath(
    new URL(
      '../../supabase/functions/send-surat-overdue-reminders/index.ts',
      import.meta.url,
    ),
  );

  // Grabs everything between the function signature and the closing brace that
  // sits alone in column 0 — both copies are top-level declarations, so the
  // first such brace terminates the body.
  function extractBody(source: string, path: string): string {
    const match = source.match(
      /(?:export\s+)?function businessDaysSince\([\s\S]*?\n\}/,
    );
    if (!match) {
      throw new Error(`businessDaysSince() not found in ${path}`);
    }
    return match[0]
      .replace(/^export\s+/, '')
      .replace(/\/\/.*$/gm, '') // drop trailing comments; they differ by design
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('has byte-identical implementations once whitespace is normalized', () => {
    const client = extractBody(readFileSync(CLIENT_PATH, 'utf8'), CLIENT_PATH);
    const edge = extractBody(readFileSync(EDGE_PATH, 'utf8'), EDGE_PATH);

    expect(edge).toBe(client);
  });

  it('resolves the WITA offset identically in both files', () => {
    const offset = /const WITA_OFFSET_MS = 8 \* 60 \* 60 \* 1000;/;

    expect(readFileSync(CLIENT_PATH, 'utf8')).toMatch(offset);
    expect(readFileSync(EDGE_PATH, 'utf8')).toMatch(offset);
  });
});
