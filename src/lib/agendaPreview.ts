import { witaDateISO, witaMinutesOfDay, witaTimeHHMM, witaTodayISO } from './date';
import type { AgendaPimpinan } from '@/types';

// Fetch plan + selection rule for the public Preview Agenda Pimpinan list
// (AgendaPreviewHome). Kept here, separate from the component and from the
// Supabase client, because this is the part with actual behaviour worth
// testing — no DOM and no network needed.
//
// Why this exists at all: nomor_urut is assigned by
// resequence_agenda_pimpinan_by_date() as
//   ORDER BY tanggal_kegiatan DESC NULLS LAST, entry_seq DESC
// so nomor_urut = 1 is the agenda furthest in the FUTURE. The preview used
// to fetch `nomor_urut ASC LIMIT 10`, which therefore returned the ten most
// distant agendas and pushed Hari ini / Besok / Lusa off the end entirely
// as soon as the table held more than ten rows. Raising the limit does not
// fix that — the protected days sort last, so they are still the first
// things dropped. The ordering has to be inverted and the near days
// protected explicitly, at both the query and the selection layer.

/** Hard maximum number of items the preview renders. Never exceeded. */
export const PREVIEW_TARGET = 15;

/** How many days ahead stay protected: today (0), besok (1), lusa (2). */
export const PROTECTED_DAY_OFFSETS = [0, 1, 2] as const;

/** Minimal shape this module needs; AgendaPimpinan satisfies it. */
export type PreviewAgenda = Pick<
  AgendaPimpinan,
  'tanggalKegiatan' | 'waktuKegiatan' | 'nomorUrut'
>;

// --- Bounded fetch plan ----------------------------------------------
//
// The preview used to issue one query — "everything from today onward,
// first 60 rows". That has a correctness hole: a day holding 60+ rows whose
// times have already passed fills the whole window, and Besok/Lusa never
// reach the client at all. Widening 60 only moves the threshold; the fix is
// to stop letting one day's volume compete with another's for the same
// budget.
//
// So each protected day gets its own query with its own limit, and the
// later-future filler gets one more. Because Besok's query filters
// `tanggal_kegiatan = <besok>`, no number of Hari ini rows can displace a
// single row from it. See docs in loadPreviewAgendas() for the full
// argument.

/**
 * One bounded server query. `kind: 'day'` means an exact WITA calendar day;
 * `kind: 'after'` means strictly later than `date`, used for the filler.
 * The time bounds compare `waktu_kegiatan` lexicographically, which for
 * zero-padded 'HH:MM' is the same as comparing clock times.
 */
export interface PreviewQuery {
  kind: 'day' | 'after';
  date: string;
  timeFrom?: string;
  timeBefore?: string;
  limit: number;
}

/** Runs one bounded query. Implemented in lib/db.ts against Supabase. */
export type PreviewQueryRunner<T> = (query: PreviewQuery) => Promise<T[]>;

/**
 * The queries needed to guarantee every protected day can be represented.
 *
 * Today is split in two rather than fetched as one ordered page, because
 * `waktu_kegiatan ASC` puts the already-finished morning rows first: a day
 * with 15+ expired agendas would return nothing usable. Splitting on the
 * current WITA time gives:
 *
 *  - `timeFrom: now`  -> today's still-upcoming rows, nearest first. Also
 *    catches rows whose time field is malformed ('pagi', '99:99'), since
 *    letters and '9' sort after the current 'HH:MM'.
 *  - `timeBefore: now` -> the low-sorting rows, nearest first. This is how
 *    all-day agendas are collected: '' and '00:00' sort before every real
 *    clock time, so they are always inside this page's first rows. Genuinely
 *    expired rows come back too and isEligible() drops them.
 *
 * Each limit is PREVIEW_TARGET because no single day, and no filler, can
 * ever contribute more than PREVIEW_TARGET items to a PREVIEW_TARGET-capped
 * list — so fetching more could not change the output.
 */
export function buildPreviewQueries(nowMs: number = Date.now()): PreviewQuery[] {
  const today = witaTodayISO(nowMs);
  const now = witaTimeHHMM(nowMs);
  const lusa = witaDateISO(2, nowMs);

  return [
    { kind: 'day', date: today, timeFrom: now, limit: PREVIEW_TARGET },
    { kind: 'day', date: today, timeBefore: now, limit: PREVIEW_TARGET },
    { kind: 'day', date: witaDateISO(1, nowMs), limit: PREVIEW_TARGET },
    { kind: 'day', date: lusa, limit: PREVIEW_TARGET },
    { kind: 'after', date: lusa, limit: PREVIEW_TARGET },
  ];
}

/**
 * Runs the fetch plan and returns the rows to select from.
 *
 * Correctness argument for the bound — for any table size:
 *  1. Each protected day is queried by an equality filter on its own date,
 *     so rows from another day cannot consume its limit. Hari ini having
 *     10,000 rows changes nothing about what Besok's query returns.
 *  2. Within today, the two halves partition the day at the current WITA
 *     time, so a pile of expired rows cannot hide the upcoming ones.
 *  3. A day can contribute at most PREVIEW_TARGET items to the final list,
 *     and each per-day limit is PREVIEW_TARGET, so no reachable row is lost.
 *  4. The filler is capped the same way and can only ever fill leftover
 *     slots, of which there are at most PREVIEW_TARGET.
 * Therefore if an eligible agenda exists on a protected day, at least one
 * reaches selectPreviewAgendas(). Total rows fetched is at most
 * 5 x PREVIEW_TARGET regardless of table size.
 *
 * The five queries partition the timeline (disjoint dates; today split on a
 * half-open time boundary), so duplicates are not possible — the dedupe is
 * an invariant guard, not load-bearing.
 */
export async function loadPreviewAgendas<T extends PreviewAgenda & { id: string }>(
  run: PreviewQueryRunner<T>,
  nowMs: number = Date.now(),
): Promise<T[]> {
  const pages = await Promise.all(buildPreviewQueries(nowMs).map(run));

  const byId = new Map<string, T>();
  for (const page of pages) {
    for (const row of page) if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

// --- Selection --------------------------------------------------------

// waktu_kegiatan is `text NOT NULL DEFAULT '00:00'`, so it may be '', a
// well-formed 'HH:MM', or something a hand-edited row put there. Anything
// unparseable is treated as an all-day agenda (minute 0) rather than
// discarded: dropping a today agenda because its time field is malformed
// would be the same class of silent disappearance this fix is removing.
function minutesOfDay(waktu: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(waktu.trim());
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return 0;
  return h * 60 + min;
}

/**
 * True while an agenda is still upcoming in WITA terms.
 *
 * A future date is always eligible. A today agenda stays eligible until its
 * own waktu_kegiatan has passed in WITA, so a morning meeting does not
 * vanish from the preview at 00:01 just because later agendas exist. An
 * all-day agenda (no usable time) survives the entire WITA day. Past dates
 * and rows with no date at all are out.
 */
export function isEligible(item: PreviewAgenda, nowMs: number = Date.now()): boolean {
  const iso = item.tanggalKegiatan;
  if (!iso) return false;

  const today = witaTodayISO(nowMs);
  if (iso < today) return false;
  if (iso > today) return true;

  const scheduled = minutesOfDay(item.waktuKegiatan);
  if (scheduled === 0) return true; // all-day: eligible until the day ends
  return witaMinutesOfDay(nowMs) <= scheduled;
}

/** Chronological: date, then time of day, then nomor_urut as a stable tiebreak. */
function byChronology(a: PreviewAgenda, b: PreviewAgenda): number {
  const dateDiff = (a.tanggalKegiatan ?? '').localeCompare(b.tanggalKegiatan ?? '');
  if (dateDiff !== 0) return dateDiff;
  const timeDiff = minutesOfDay(a.waktuKegiatan) - minutesOfDay(b.waktuKegiatan);
  if (timeDiff !== 0) return timeDiff;
  return a.nomorUrut - b.nomorUrut;
}

/** True when the agenda falls on today, besok or lusa in WITA. */
export function isProtectedDay(item: PreviewAgenda, nowMs: number = Date.now()): boolean {
  if (!item.tanggalKegiatan) return false;
  return PROTECTED_DAY_OFFSETS.some(
    (offset) => item.tanggalKegiatan === witaDateISO(offset, nowMs),
  );
}

/**
 * Picks the agendas the preview shows.
 *
 * `target` is a HARD maximum: the result never exceeds it. Slots are handed
 * out in two passes over the buckets [hari ini, besok, lusa, later future],
 * each bucket already in chronological order:
 *
 *  1. Representation — every protected day that has an eligible agenda gets
 *     one slot, in priority order, while slots remain. This is what stops a
 *     busy Hari ini from erasing Besok and Lusa entirely: with 20 today, 1
 *     besok and 1 lusa, the reservation runs first, so today is capped at 13
 *     and the result is 15 items with all three days present.
 *  2. Fill — leftover slots go to the same buckets in the same priority
 *     order, so the nearest agendas win, and only the later-future tail is
 *     trimmed.
 *
 * Because protected buckets hold strictly earlier dates than the filler and
 * each bucket is internally sorted, concatenating them in bucket order
 * yields a chronological list.
 */
export function selectPreviewAgendas<T extends PreviewAgenda>(
  items: T[],
  nowMs: number = Date.now(),
  target: number = PREVIEW_TARGET,
): T[] {
  const eligible = [...items]
    .filter((item) => isEligible(item, nowMs))
    .sort(byChronology);

  const protectedDays = PROTECTED_DAY_OFFSETS.map((offset) => witaDateISO(offset, nowMs));
  const buckets: T[][] = [...protectedDays.map(() => [] as T[]), []];
  for (const item of eligible) {
    const dayIndex = protectedDays.indexOf(item.tanggalKegiatan ?? '');
    buckets[dayIndex === -1 ? buckets.length - 1 : dayIndex].push(item);
  }

  const take = buckets.map(() => 0);
  let used = 0;

  // Pass 1: one guaranteed slot per represented protected day.
  for (let i = 0; i < protectedDays.length; i++) {
    if (buckets[i].length > 0 && used < target) {
      take[i] = 1;
      used++;
    }
  }

  // Pass 2: distribute what is left, nearest first.
  for (let i = 0; i < buckets.length && used < target; i++) {
    const more = Math.min(buckets[i].length - take[i], target - used);
    take[i] += more;
    used += more;
  }

  return buckets.flatMap((bucket, i) => bucket.slice(0, take[i]));
}
