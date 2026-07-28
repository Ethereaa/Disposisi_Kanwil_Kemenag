import { useState } from 'react';
import { FileSpreadsheet, FileText, Download, CalendarRange, Database, Inbox, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { displayToISO, isoToDisplay } from '@/lib/date';
import { exportData } from '@/lib/export';
import type { SuratMasuk, SuratKeluar } from '@/types';

interface Props {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
}

type Scope = 'all' | 'masuk' | 'keluar' | 'range';

const scopeOptions: { key: Scope; label: string; desc: string; icon: typeof Database }[] = [
  { key: 'all', label: 'Semua Data', desc: 'Surat masuk & keluar', icon: Database },
  { key: 'masuk', label: 'Surat Masuk', desc: 'Hanya surat masuk', icon: Inbox },
  { key: 'keluar', label: 'Surat Keluar', desc: 'Hanya surat keluar', icon: Send },
  { key: 'range', label: 'Rentang Tanggal', desc: 'Filter berdasarkan tanggal', icon: CalendarRange },
];

export function ExportPage({ suratMasuk, suratKeluar }: Props) {
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
      <div>
        <h2 className="text-lg font-semibold text-office-text dark:text-slate-100">Export Data</h2>
        <p className="text-sm text-office-subtext dark:text-slate-400">Unduh data disposisi dalam format Excel atau Word.</p>
      </div>

      {/* Scope */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200">Pilih Data</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {scopeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = scope === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setScope(opt.key)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${active ? 'border-office-primary bg-blue-50 dark:bg-blue-950/30' : 'border-office-border dark:border-slate-700 hover:border-office-primary/40'}`}
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-office-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-office-subtext dark:text-slate-400'}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${active ? 'text-office-primary dark:text-blue-300' : 'text-office-text dark:text-slate-200'}`}>{opt.label}</p>
                  <p className="text-xs text-office-subtext dark:text-slate-400">{opt.desc}</p>
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
              <p className="sm:col-span-2 text-xs text-office-subtext dark:text-slate-400">
                Rentang: {isoToDisplay(displayToISO(startDisplay))} s/d {isoToDisplay(displayToISO(endDisplay))}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Format */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200">Pilih Format</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={() => setFormat('xlsx')}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${format === 'xlsx' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-office-border dark:border-slate-700 hover:border-emerald-400'}`}
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${format === 'xlsx' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-office-subtext dark:text-slate-400'}`}>
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${format === 'xlsx' ? 'text-emerald-700 dark:text-emerald-300' : 'text-office-text dark:text-slate-200'}`}>Excel (.xlsx)</p>
              <p className="text-xs text-office-subtext dark:text-slate-400">Spreadsheet, mudah diolah</p>
            </div>
          </button>
          <button
            onClick={() => setFormat('docx')}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${format === 'docx' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-office-border dark:border-slate-700 hover:border-blue-400'}`}
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${format === 'docx' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-office-subtext dark:text-slate-400'}`}>
              <FileText size={18} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${format === 'docx' ? 'text-blue-700 dark:text-blue-300' : 'text-office-text dark:text-slate-200'}`}>Word (.docx)</p>
              <p className="text-xs text-office-subtext dark:text-slate-400">Dokumen, siap cetak</p>
            </div>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="lg" onClick={handleExport} disabled={busy}>
          <Download size={18} /> {busy ? 'Memproses...' : 'Export Sekarang'}
        </Button>
        <p className="text-xs text-office-subtext dark:text-slate-400">
          {suratMasuk.length} surat masuk · {suratKeluar.length} surat keluar
        </p>
      </div>
    </div>
  );
}
