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

export function formatDateTime(value: string | number): string {
  const d = new Date(value);
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()} ${pad(local.getHours())}:${pad(local.getMinutes())}`;
}
