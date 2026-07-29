import { useState } from 'react';
import { FileSpreadsheet, FileText, Download, CalendarRange, Database, Inbox, Send, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { displayToISO, isoToDisplay } from '@/lib/date';
import { exportData } from '@/lib/export';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar } from '@/types';

interface Props {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
}

type Scope = 'all' | 'masuk' | 'keluar' | 'agenda' | 'range';

const scopeOptions: { key: Scope; label: string; desc: string; icon: typeof Database }[] = [
  { key: 'all', label: 'Semua Data', desc: 'Surat masuk, keluar & agenda pimpinan', icon: Database },
  { key: 'masuk', label: 'Surat Masuk', desc: 'Hanya surat masuk', icon: Inbox },
  { key: 'keluar', label: 'Surat Keluar', desc: 'Hanya surat keluar', icon: Send },
  { key: 'agenda', label: 'Agenda Pimpinan', desc: 'Hanya agenda pimpinan', icon: CalendarClock },
  { key: 'range', label: 'Rentang Tanggal', desc: 'Filter berdasarkan tanggal', icon: CalendarRange },
];

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
    } catch {
      toast('Gagal mengekspor data.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-[24px] border border-emerald-100/80 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Export Data</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Unduh data disposisi dalam format Excel atau Word dengan tampilan yang lebih rapi.</p>
      </div>

      {/* Scope */}
      <div className="space-y-4 rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pilih Data</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {scopeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = scope === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setScope(opt.key)}
                className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${active ? 'border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/30' : 'border-emerald-100 hover:border-emerald-300 dark:border-slate-700 dark:hover:border-emerald-500/40'}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>{opt.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {scope === 'range' && (
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <Field label="Tanggal Mulai" hint="DD/MM/YYYY">
              <Input
                type="text"
                value={startDisplay}
                onChange={(e) => setStartDisplay(e.target.value)}
                placeholder="DD/MM/YYYY"
              />
            </Field>
            <Field label="Tanggal Akhir" hint="DD/MM/YYYY">
              <Input
                type="text"
                value={endDisplay}
                onChange={(e) => setEndDisplay(e.target.value)}
                placeholder="DD/MM/YYYY"
              />
            </Field>
            {startDisplay && endDisplay && (
              <p className="sm:col-span-2 text-xs text-slate-500 dark:text-slate-400">
                Rentang: {isoToDisplay(displayToISO(startDisplay))} s/d {isoToDisplay(displayToISO(endDisplay))}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Format */}
      <div className="space-y-4 rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pilih Format</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={() => setFormat('xlsx')}
            className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${format === 'xlsx' ? 'border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/30' : 'border-emerald-100 hover:border-emerald-300 dark:border-slate-700 dark:hover:border-emerald-500/40'}`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${format === 'xlsx' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${format === 'xlsx' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>Excel (.xlsx)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Spreadsheet, mudah diolah</p>
            </div>
          </button>
          <button
            onClick={() => setFormat('docx')}
            className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${format === 'docx' ? 'border-teal-500 bg-teal-50 shadow-sm dark:bg-teal-950/30' : 'border-emerald-100 hover:border-teal-300 dark:border-slate-700 dark:hover:border-teal-500/40'}`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${format === 'docx' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
              <FileText size={18} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${format === 'docx' ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-200'}`}>Word (.docx)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dokumen, siap cetak</p>
            </div>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="lg" onClick={handleExport} disabled={busy}>
          <Download size={18} /> {busy ? 'Memproses...' : 'Export Sekarang'}
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {suratMasuk.length} surat masuk · {suratKeluar.length} surat keluar · {agendaPimpinan.length} agenda pimpinan
        </p>
      </div>
    </div>
  );
}
