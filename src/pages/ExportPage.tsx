import { useState } from 'react';
import { FileSpreadsheet, FileText, Download, CalendarRange, Database, Inbox, Send, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Surface } from '@/components/ui/Surface';
import { Field, Input } from '@/components/ui/Form';
import { SelectionCardGroup, type SelectionCardOption } from '@/components/ui/SelectionCard';
import { useToast } from '@/components/ui/Toast';
import { displayToISO, isoToDisplay } from '@/lib/date';
import { exportData } from '@/lib/export';
import { getErrorMessage } from '@/lib/error';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar } from '@/types';

interface Props {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
}

type Scope = 'all' | 'masuk' | 'keluar' | 'agenda' | 'range';
type Format = 'xlsx' | 'docx';

const scopeOptions: SelectionCardOption<Scope>[] = [
  { key: 'all', label: 'Semua Data', desc: 'Surat masuk, keluar & agenda pimpinan', icon: Database },
  { key: 'masuk', label: 'Surat Masuk', desc: 'Hanya surat masuk', icon: Inbox },
  { key: 'keluar', label: 'Surat Keluar', desc: 'Hanya surat keluar', icon: Send },
  { key: 'agenda', label: 'Agenda Pimpinan', desc: 'Hanya agenda pimpinan', icon: CalendarClock },
  { key: 'range', label: 'Rentang Tanggal', desc: 'Filter berdasarkan tanggal', icon: CalendarRange },
];

const formatOptions: SelectionCardOption<Format>[] = [
  { key: 'xlsx', label: 'Excel (.xlsx)', desc: 'Spreadsheet, mudah diolah', icon: FileSpreadsheet },
  { key: 'docx', label: 'Word (.docx)', desc: 'Dokumen, siap cetak', icon: FileText },
];

// ─────────────────────────────────────────────────────────────────────────────
// One numbered band per decision, and ONE selected treatment for both bands.
//
// Before: two `soft-panel` cards of 2px-bordered tiles, where the scope tiles
// selected in emerald and the format tiles selected in emerald OR teal — so
// "chosen" had two different colours on the same page, and the real primary
// action sat unframed on the canvas underneath. Now the whole choice lives in
// one Surface with numbered bands, and the export action has its own footer.
//
// The tiles themselves moved to ui/SelectionCard: the local ChoiceTile carried
// radiogroup ARIA with no arrow-key behaviour behind it. ChoiceBand stays here
// — it is this page's step chrome, not a selection primitive.
// ─────────────────────────────────────────────────────────────────────────────

function ChoiceBand({ step, title, hint, children }: { step: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-office-primary/10 text-[11px] font-bold text-office-primary dark:bg-emerald-500/15 dark:text-emerald-400"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-heading text-office-text dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-office-subtext dark:text-slate-400">{hint}</p>
        </div>
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

export function ExportPage({ suratMasuk, suratKeluar, agendaPimpinan }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [format, setFormat] = useState<Format>('xlsx');
  // Native date inputs, so these hold ISO yyyy-mm-dd (they were free-text
  // DD/MM/YYYY — the only date control in the app that wasn't native).
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [dateErrors, setDateErrors] = useState<{ start?: string; end?: string }>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Still routed through displayToISO even though a native date input already
  // yields ISO: displayToISO passes a yyyy-mm-dd string through untouched
  // (date.ts), so the exact same function produces the exact same value that
  // reaches exportData as before. Evaluated once here instead of eight times
  // across validation, payload and the preview line.
  const startISO = displayToISO(startInput);
  const endISO = displayToISO(endInput);

  function updateStart(value: string) {
    setStartInput(value);
    setDateErrors({});
  }
  function updateEnd(value: string) {
    setEndInput(value);
    setDateErrors({});
  }
  function updateScope(next: Scope) {
    setScope(next);
    // Leaving the range scope drops a stale "wajib diisi" that no longer
    // applies to the choice now selected.
    if (next !== 'range') setDateErrors({});
  }

  async function handleExport() {
    // Same two conditions, in the same order, with the same early return and
    // the same toasts as before — the messages are now also published inline on
    // the offending field instead of only in a toast that vanishes.
    if (scope === 'range') {
      if (!startISO || !endISO) {
        setDateErrors({
          start: !startISO ? 'Tanggal mulai wajib diisi' : undefined,
          end: !endISO ? 'Tanggal akhir wajib diisi' : undefined,
        });
        toast('Isi tanggal mulai dan tanggal akhir.', 'error');
        return;
      }
      if (startISO > endISO) {
        setDateErrors({ end: 'Tanggal akhir harus setelah tanggal mulai' });
        toast('Tanggal mulai harus sebelum tanggal akhir.', 'error');
        return;
      }
    }
    setDateErrors({});
    setBusy(true);
    try {
      await exportData({
        scope,
        format,
        startDate: startISO,
        endDate: endISO,
        suratMasuk,
        suratKeluar,
        agendaPimpinan,
      });
      toast(`Export ${format.toUpperCase()} berhasil.`, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal mengekspor data.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title="Export Data"
        icon={Download}
        description="Unduh data disposisi dalam format Excel atau Word."
      />

      <Surface className="overflow-hidden">
        <ChoiceBand step={1} title="Pilih data" hint="Menentukan baris mana yang masuk ke berkas.">
          <SelectionCardGroup
            label="Data yang diekspor"
            value={scope}
            onChange={updateScope}
            options={scopeOptions}
          />

          {scope === 'range' && (
            <div className="mt-3.5 grid gap-3 rounded-control border border-office-border bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-2">
              <Field label="Tanggal Mulai" error={dateErrors.start}>
                <Input type="date" value={startInput} onChange={(e) => updateStart(e.target.value)} />
              </Field>
              <Field label="Tanggal Akhir" error={dateErrors.end}>
                <Input type="date" value={endInput} onChange={(e) => updateEnd(e.target.value)} />
              </Field>
              {startISO && endISO && (
                <p className="text-xs text-office-subtext dark:text-slate-400 sm:col-span-2">
                  Rentang: {isoToDisplay(startISO)} s/d {isoToDisplay(endISO)}
                </p>
              )}
            </div>
          )}
        </ChoiceBand>

        <div className="border-t border-office-border dark:border-slate-700">
          <ChoiceBand step={2} title="Pilih format" hint="Menentukan jenis berkas yang diunduh.">
            <SelectionCardGroup label="Format berkas" value={format} onChange={setFormat} options={formatOptions} />
          </ChoiceBand>
        </div>

        {/* The action lives inside the panel it acts on, on a tinted footer, so
            "Export Sekarang" is the one obvious end of the flow rather than a
            loose button on the canvas. Full-width on mobile. */}
        <div className="flex flex-col-reverse gap-3 border-t border-office-border bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-xs leading-5 text-office-subtext dark:text-slate-400">
            Tersedia: {suratMasuk.length} surat masuk · {suratKeluar.length} surat keluar · {agendaPimpinan.length}{' '}
            agenda pimpinan
          </p>
          <Button size="lg" className="w-full sm:w-auto sm:shrink-0" onClick={handleExport} isLoading={busy}>
            {!busy && <Download size={18} aria-hidden="true" />} {busy ? 'Memproses…' : 'Export Sekarang'}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
