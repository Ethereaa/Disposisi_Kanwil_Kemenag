import { describe, expect, it } from 'vitest';
import { formatIndonesianDate, formatIndonesianDateRange, witaDateTimeLabel } from './date';

// These three back the public Agenda Pimpinan preview header and footer. All of
// them are pure — the range formatter takes both endpoints as ISO strings, and
// witaDateTimeLabel takes the instant — so nothing here reads the host clock,
// and every case below must hold identically under `npm run test:tz`.

describe('formatIndonesianDate', () => {
  it('renders long-form Indonesian with an unpadded day', () => {
    expect(formatIndonesianDate('2026-09-01')).toBe('1 September 2026');
    expect(formatIndonesianDate('2026-12-25')).toBe('25 Desember 2026');
  });

  it('returns empty for missing or malformed input', () => {
    expect(formatIndonesianDate(null)).toBe('');
    expect(formatIndonesianDate(undefined)).toBe('');
    expect(formatIndonesianDate('')).toBe('');
    expect(formatIndonesianDate('01/09/2026')).toBe('');
    // Well-shaped but impossible: must not index the month table out of bounds.
    expect(formatIndonesianDate('2026-13-01')).toBe('');
  });
});

describe('formatIndonesianDateRange', () => {
  it('collapses to one month when start and end share it', () => {
    expect(formatIndonesianDateRange('2026-09-01', '2026-09-15')).toBe('1–15 September 2026');
  });

  it('repeats the month but not the year within one year', () => {
    expect(formatIndonesianDateRange('2026-09-01', '2026-10-18')).toBe('1 September – 18 Oktober 2026');
  });

  it('spells both years out when they differ', () => {
    expect(formatIndonesianDateRange('2026-12-20', '2027-01-08')).toBe('20 Desember 2026 – 8 Januari 2027');
  });

  // The end date comes from the data, so "nothing scheduled" and "only today is
  // scheduled" both have to degrade to a single day rather than a range.
  it('falls back to the start date alone', () => {
    expect(formatIndonesianDateRange('2026-09-01', null)).toBe('1 September 2026');
    expect(formatIndonesianDateRange('2026-09-01', undefined)).toBe('1 September 2026');
    expect(formatIndonesianDateRange('2026-09-01', '2026-09-01')).toBe('1 September 2026');
    expect(formatIndonesianDateRange('2026-09-01', 'not-a-date')).toBe('1 September 2026');
  });

  it('never renders a backwards range', () => {
    expect(formatIndonesianDateRange('2026-09-10', '2026-09-01')).toBe('10 September 2026');
  });

  it('returns empty without a usable start', () => {
    expect(formatIndonesianDateRange(null, '2026-09-15')).toBe('');
  });
});

describe('witaDateTimeLabel', () => {
  // 1 Sep 2026 00:45 UTC is 08:45 WITA the same day.
  it('reports the WITA wall clock, not the host one', () => {
    expect(witaDateTimeLabel(Date.UTC(2026, 8, 1, 0, 45))).toBe('1 September 2026 08:45 WITA');
  });

  // The window this page is most likely to be opened in on a UTC host: after
  // WITA midnight but still on the previous UTC calendar day.
  it('rolls the date over at WITA midnight, not UTC midnight', () => {
    expect(witaDateTimeLabel(Date.UTC(2026, 7, 31, 16, 5))).toBe('1 September 2026 00:05 WITA');
    expect(witaDateTimeLabel(Date.UTC(2026, 7, 31, 15, 59))).toBe('31 Agustus 2026 23:59 WITA');
  });

  it('zero-pads the clock', () => {
    expect(witaDateTimeLabel(Date.UTC(2026, 8, 1, 1, 3))).toBe('1 September 2026 09:03 WITA');
  });
});
