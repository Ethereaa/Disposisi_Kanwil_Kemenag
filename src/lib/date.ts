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

// Counts full weekdays (Mon-Fri) between an ISO timestamp and now, used to
// flag a Surat Masuk as overdue without counting weekends against it. Walks
// day-by-day rather than doing calendar math, which is plenty fast for the
// handful of "Diproses" records this ever runs against.
export function businessDaysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function formatDateTime(value: string | number): string {
  const d = new Date(value);
  const tz = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()} ${pad(local.getHours())}:${pad(local.getMinutes())}`;
}
