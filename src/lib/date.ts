// Lightweight date utilities. Internal storage uses ISO yyyy-mm-dd;
// the UI displays DD/MM/YYYY.

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function isoToDayName(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  // Construct using local (noon) time to avoid UTC off-by-one day shifts.
  const date = new Date(y, m - 1, d, 12);
  return HARI_ID[date.getDay()];
}

export function isoToDisplayWithDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const day = isoToDayName(iso);
  const display = isoToDisplay(iso);
  if (!day || !display) return display;
  return `${day}, ${display}`;
}

export function displayToISO(display: string): string {
  const trimmed = display.trim();
  if (!trimmed) return '';
  const [d, m, y] = trimmed.split('/');
  if (d && m && y) {
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return '';
}

export function isWithinRange(iso: string | null, startISO: string, endISO: string): boolean {
  if (!iso) return false;
  if (startISO && iso < startISO) return false;
  if (endISO && iso > endISO) return false;
  return true;
}

export function isToday(iso: string | null): boolean {
  return !!iso && iso === todayISO();
}

export function isThisMonth(iso: string | null): boolean {
  return !!iso && iso.slice(0, 7) === todayISO().slice(0, 7);
}

// WITA (Asia/Makassar) is UTC+8 throughout the year.
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

// Counts elapsed weekdays using WITA calendar-day boundaries.
// Keep this logic synchronized with send-surat-overdue-reminders.
export function businessDaysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return 0;

  const cursor = new Date(from.getTime() + WITA_OFFSET_MS);
  cursor.setUTCHours(0, 0, 0, 0);

  const end = new Date(Date.now() + WITA_OFFSET_MS);
  end.setUTCHours(0, 0, 0, 0);

  let count = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// --- WITA calendar-day helpers ---------------------------------------
//
// todayISO() above resolves the calendar day in the *browser's* timezone.
// That is fine for the data-entry screens, which run on office machines
// already set to WITA, but not for deciding what the public Agenda
// Pimpinan preview still counts as upcoming: that has to follow the
// office's own day boundary no matter what device opens the link. These
// reuse WITA_OFFSET_MS so this file keeps exactly one offset constant.
//
// nowMs is injectable so the selection logic can be tested at fixed
// instants without touching global time.

function witaShifted(nowMs: number): Date {
  return new Date(nowMs + WITA_OFFSET_MS);
}

/** Current calendar day in WITA, as ISO yyyy-mm-dd. */
export function witaTodayISO(nowMs: number = Date.now()): string {
  return witaShifted(nowMs).toISOString().slice(0, 10);
}

/** The WITA calendar day `offsetDays` after today, as ISO yyyy-mm-dd. */
export function witaDateISO(offsetDays: number, nowMs: number = Date.now()): string {
  const d = witaShifted(nowMs);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Minutes elapsed since midnight WITA (0-1439). */
export function witaMinutesOfDay(nowMs: number = Date.now()): number {
  const d = witaShifted(nowMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Current WITA clock time as zero-padded 'HH:MM'.
 *
 * Zero-padded so it can be compared lexicographically against the
 * `waktu_kegiatan` text column directly in a Postgres filter, which is what
 * the Agenda Pimpinan preview does to split today into its already-finished
 * and still-upcoming halves.
 */
export function witaTimeHHMM(nowMs: number = Date.now()): string {
  const total = witaMinutesOfDay(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Classifies an ISO date as today / tomorrow / the day after, relative to a
 * reference day, and returns the Indonesian label — or null when it is none
 * of them. Backs DateProximityBadge.
 *
 * `referenceISO` is plain yyyy-mm-dd and the offsets are applied with UTC
 * arithmetic on a UTC-midnight date, so the result is a pure function of the
 * two strings. The caller has already decided which timezone "today" means —
 * the Agenda Pimpinan preview passes a WITA day — and re-deriving it from the
 * local clock here would silently override that choice.
 */
export function dateProximityLabel(
  iso: string | null | undefined,
  referenceISO: string,
): 'Hari Ini' | 'Besok' | 'Lusa' | null {
  if (!iso || !referenceISO) return null;

  const ref = new Date(`${referenceISO}T00:00:00Z`);
  if (Number.isNaN(ref.getTime())) return null;

  const labels = ['Hari Ini', 'Besok', 'Lusa'] as const;
  for (let offset = 0; offset < labels.length; offset++) {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() + offset);
    if (iso === d.toISOString().slice(0, 10)) return labels[offset];
  }
  return null;
}

// --- Indonesian long-form dates --------------------------------------
//
// Used by the public Agenda Pimpinan preview header, which has to read as an
// official notice ("1–15 September 2026") rather than as the DD/MM/YYYY the
// data-entry screens use.

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type IsoParts = { y: number; m: number; d: number };

/**
 * Strict yyyy-mm-dd split. Returns null for anything else, including a
 * well-shaped string with an impossible month, so the formatters below can
 * never index BULAN_ID out of bounds.
 */
function isoParts(iso: string | null | undefined): IsoParts | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function longForm(p: IsoParts): string {
  return `${p.d} ${BULAN_ID[p.m - 1]} ${p.y}`;
}

/** Chronological ordering key. Only meaningful against another of these. */
function ordinal(p: IsoParts): number {
  return p.y * 10000 + p.m * 100 + p.d;
}

/** `2026-09-01` -> `1 September 2026`. Day is not zero-padded. */
export function formatIndonesianDate(iso: string | null | undefined): string {
  const p = isoParts(iso);
  return p ? longForm(p) : '';
}

/**
 * A date range in Indonesian long form, collapsing whatever the two endpoints
 * already share:
 *
 *   same month and year   1–15 September 2026
 *   same year             1 September – 18 Oktober 2026
 *   different years       20 Desember 2026 – 8 Januari 2027
 *
 * Falls back to the start date alone when `endISO` is missing, unparseable,
 * equal to the start, or earlier than it — the public preview passes an end
 * that comes from the data, so "no future agenda stored" has to render as a
 * single day rather than as a backwards range.
 *
 * Pure in both arguments: no clock, no timezone. The caller decides which day
 * "today" is.
 */
export function formatIndonesianDateRange(
  startISO: string | null | undefined,
  endISO: string | null | undefined,
): string {
  const s = isoParts(startISO);
  if (!s) return '';
  const e = isoParts(endISO);
  if (!e || ordinal(e) <= ordinal(s)) return longForm(s);

  if (s.y !== e.y) return `${longForm(s)} – ${longForm(e)}`;
  if (s.m !== e.m) {
    return `${s.d} ${BULAN_ID[s.m - 1]} – ${e.d} ${BULAN_ID[e.m - 1]} ${e.y}`;
  }
  return `${s.d}–${e.d} ${BULAN_ID[s.m - 1]} ${s.y}`;
}

/**
 * An instant as `1 September 2026 08:45 WITA`.
 *
 * Deliberately NOT formatDateTime(): that one shifts by the visitor's
 * getTimezoneOffset(), so a phone set to WIB would render a "… WITA" label
 * showing a WIB clock. This composes the two WITA helpers above instead, so
 * the label matches the office no matter what device opens the link.
 */
export function witaDateTimeLabel(ms: number = Date.now()): string {
  return `${formatIndonesianDate(witaTodayISO(ms))} ${witaTimeHHMM(ms)} WITA`;
}

export function formatDateTime(value: string | number): string {
  const d = new Date(value);
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()} ${pad(local.getHours())}:${pad(local.getMinutes())}`;
}
