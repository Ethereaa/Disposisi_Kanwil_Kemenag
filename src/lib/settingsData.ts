import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS "AKTIVITAS TERBARU"
//
// The panel renders exactly ten rows: the ten most recently touched records
// across Surat Masuk, Surat Keluar and Agenda Pimpinan. It used to get them by
// taking all three tables in full as props and merging them client-side, which
// made /settings the most expensive route in the app to open — three whole
// datasets downloaded for ten lines of text.
//
// Instead: ten candidates from each table, merged with the page's own
// comparator. Ten per table is sufficient rather than a guess — the merged
// result is ten rows, so it can hold at most ten from any single table, and a
// table's 11th-newest row therefore cannot place in it whatever the other two
// tables contain.
//
// Ordering per table is `updated_at DESC, nomor_urut ASC`, which reproduces the
// legacy ordering exactly:
//
//   · `updated_at` alone is exact for the merge key. It is NOT NULL on all
//     three tables, so `updated_at || created_at` is always `updated_at`.
//   · `nomor_urut ASC` reproduces the legacy tie order. The full arrays arrived
//     ordered by nomor_urut ascending (getAllMasuk / getAllKeluar /
//     getAllAgendaPimpinan), and Array#sort is stable, so records sharing a
//     timestamp kept nomor_urut order.
//
// Checked against production, including millisecond timestamp ties: the legacy
// full-array top ten and this candidate strategy agree on every position
// (different_positions = 0). No migration, RPC or view is involved.
//
// These are LIMIT-by-design reads, not full-table reads that stopped early, so
// they are deliberately outside db.ts's truncation tracking — there is nothing
// here for consumeTruncationWarnings() to warn about.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY_LIMIT = 10;

// created_by_email is `NOT NULL DEFAULT ''` in practice, so this covers both a
// blank column and a row recorded before the column existed.
const UNKNOWN_AUTHOR = 'Tidak diketahui';

interface SuratActivityRow {
  id: string;
  nomor_urut: number;
  perihal: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

interface AgendaActivityRow {
  id: string;
  nomor_urut: number;
  nama_kegiatan: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface SettingsActivityItem {
  id: string;
  label: string;
  by: string;
  at: string;
  kind: 'masuk' | 'keluar' | 'agenda';
}

async function fetchMasukActivity(): Promise<SettingsActivityItem[]> {
  const { data, error } = await supabase
    .from('surat_masuk')
    .select('id, nomor_urut, perihal, created_by_email, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .order('nomor_urut', { ascending: true })
    .limit(ACTIVITY_LIMIT);

  if (error) throw error;

  return ((data ?? []) as SuratActivityRow[]).map((row) => ({
    id: `masuk-${row.id}`,
    label: `Surat Masuk No. ${row.nomor_urut} — ${row.perihal || 'tanpa perihal'}`,
    by: row.created_by_email || UNKNOWN_AUTHOR,
    at: row.updated_at || row.created_at,
    kind: 'masuk' as const,
  }));
}

async function fetchKeluarActivity(): Promise<SettingsActivityItem[]> {
  const { data, error } = await supabase
    .from('surat_keluar')
    .select('id, nomor_urut, perihal, created_by_email, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .order('nomor_urut', { ascending: true })
    .limit(ACTIVITY_LIMIT);

  if (error) throw error;

  return ((data ?? []) as SuratActivityRow[]).map((row) => ({
    id: `keluar-${row.id}`,
    label: `Surat Keluar No. ${row.nomor_urut} — ${row.perihal || 'tanpa perihal'}`,
    by: row.created_by_email || UNKNOWN_AUTHOR,
    at: row.updated_at || row.created_at,
    kind: 'keluar' as const,
  }));
}

async function fetchAgendaActivity(): Promise<SettingsActivityItem[]> {
  const { data, error } = await supabase
    .from('agenda_pimpinan')
    .select('id, nomor_urut, nama_kegiatan, created_by_email, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .order('nomor_urut', { ascending: true })
    .limit(ACTIVITY_LIMIT);

  if (error) throw error;

  return ((data ?? []) as AgendaActivityRow[]).map((row) => ({
    id: `agenda-${row.id}`,
    label: `Agenda No. ${row.nomor_urut} — ${row.nama_kegiatan || 'tanpa nama kegiatan'}`,
    by: row.created_by_email || UNKNOWN_AUTHOR,
    at: row.updated_at || row.created_at,
    kind: 'agenda' as const,
  }));
}

/**
 * The ten most recent changes across the three tables, newest first.
 *
 * Merge semantics are the page's previous ones, character for character:
 * candidates concatenated masuk → keluar → agenda, then sorted by `at`
 * descending with NO secondary key. The missing tie-breaker is the point — sort
 * is stable, so ties fall back to that concatenation order, which is what the
 * audited legacy behaviour did.
 */
export async function getRecentSettingsActivity(): Promise<SettingsActivityItem[]> {
  const [masuk, keluar, agenda] = await Promise.all([
    fetchMasukActivity(),
    fetchKeluarActivity(),
    fetchAgendaActivity(),
  ]);

  return [...masuk, ...keluar, ...agenda]
    // A no-op while created_at/updated_at stay NOT NULL, kept because it was
    // part of the expression this replaces: an undated row must not be dated
    // "Invalid Date" at the top of the list.
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, ACTIVITY_LIMIT);
}
