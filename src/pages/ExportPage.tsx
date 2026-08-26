import { useState } from 'react';
import { FileSpreadsheet, FileText, Download, CalendarRange, Database, Inbox, Send, CalendarClock, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Surface } from '@/components/ui/Surface';
import { Field, Input } from '@/components/ui/Form';
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

const scopeOptions: { key: Scope; label: string; desc: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'Semua Data', desc: 'Surat masuk, keluar & agenda pimpinan', icon: Database },
  { key: 'masuk', label: 'Surat Masuk', desc: 'Hanya surat masuk', icon: Inbox },
  { key: 'keluar', label: 'Surat Keluar', desc: 'Hanya surat keluar', icon: Send },
  { key: 'agenda', label: 'Agenda Pimpinan', desc: 'Hanya agenda pimpinan', icon: CalendarClock },
  { key: 'range', label: 'Rentang Tanggal', desc: 'Filter berdasarkan tanggal', icon: CalendarRange },
];

const formatOptions: { key: 'xlsx' | 'docx'; label: string; desc: string; icon: LucideIcon }[] = [
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

/** A selectable tile. `role="radio"` because that is what it is — a set of
 *  mutually exclusive choices — so arrow-key/screen-reader users get the same
 *  grouping the visual layout implies. */
function ChoiceTile({
  active,
  icon: Icon,
  label,
  desc,
  onSelect,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  desc: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`focus-ring flex min-h-[3.5rem] items-center gap-3 rounded-control border p-3 text-left transition-[background-color,border-color,box-shadow] duration-fast ease-brand ${
        active
          ? 'border-office-primary bg-emerald-50 ring-1 ring-office-primary dark:border-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-400'
          : 'border-office-border bg-white hover:border-office-borderStrong hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-chip ${
          active
            ? 'brand-solid text-white'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
        }`}
      >
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-body-strong ${active ? 'text-emerald-800 dark:text-emerald-200' : 'text-office-text dark:text-slate-100'}`}
        >
          {label}
        </span>
        <span className="block truncate text-xs text-office-subtext dark:text-slate-400">{desc}</span>
      </span>
      {active && (
        <Check size={16} className="shrink-0 text-office-primary dark:text-emerald-400" aria-hidden="true" />
      )}
    </button>
  );
}

export function ExportPage({ suratMasuk, suratKeluar, agendaPimpinan }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [format, setFormat] = useState<'xlsx' | 'docx'>('xlsx');
  const [startDisplay, setStartDisplay] = useState('');
  const [endDisplay, setEndDisplay] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    if (scope === 'range') {
      if (!displayToISO(startDisplay) || !displayToISO(endDisplay)) {
        toast('Isi tanggal mulai dan tanggal akhir.', 'error');
        return;
      }
      if (displayToISO(startDisplay) > displayToISO(endDisplay)) {
        toast('Tanggal mulai harus sebelum tanggal akhir.', 'error');
        return;
      }
    }
    setBusy(true);
    try {
      await exportData({
        scope,
        format,
        startDate: displayToISO(startDisplay),
        endDate: displayToISO(endDisplay),
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
          <div role="radiogroup" aria-label="Data yang diekspor" className="grid gap-2.5 sm:grid-cols-2">
            {scopeOptions.map((opt) => (
              <ChoiceTile
                key={opt.key}
                active={scope === opt.key}
                icon={opt.icon}
                label={opt.label}
                desc={opt.desc}
                onSelect={() => setScope(opt.key)}
              />
            ))}
          </div>

          {scope === 'range' && (
            <div className="mt-3.5 grid gap-3 rounded-control border border-office-border bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-2">
              <Field label="Tanggal Mulai" hint="DD/MM/YYYY">
                <Input
                  type="text"
                  value={startDisplay}
                  onChange={(e) => setStartDisplay(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Tanggal Akhir" hint="DD/MM/YYYY">
                <Input
                  type="text"
                  value={endDisplay}
                  onChange={(e) => setEndDisplay(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  inputMode="numeric"
                />
              </Field>
              {startDisplay && endDisplay && (
                <p className="text-xs text-office-subtext dark:text-slate-400 sm:col-span-2">
                  Rentang: {isoToDisplay(displayToISO(startDisplay))} s/d {isoToDisplay(displayToISO(endDisplay))}
                </p>
              )}
            </div>
          )}
        </ChoiceBand>

        <div className="border-t border-office-border dark:border-slate-700">
          <ChoiceBand step={2} title="Pilih format" hint="Menentukan jenis berkas yang diunduh.">
            <div role="radiogroup" aria-label="Format berkas" className="grid gap-2.5 sm:grid-cols-2">
              {formatOptions.map((opt) => (
                <ChoiceTile
                  key={opt.key}
                  active={format === opt.key}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                  onSelect={() => setFormat(opt.key)}
                />
              ))}
            </div>
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
            {!busy && <Download size={18} />} {busy ? 'Memproses...' : 'Export Sekarang'}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
