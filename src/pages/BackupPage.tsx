import { useRef, useState } from 'react';
import { Download, Upload, DatabaseBackup, AlertTriangle, CheckCircle2, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { exportBackup, parseBackup } from '@/lib/export';
import { getErrorMessage } from '@/lib/error';
import { clearTable, bulkInsertMasuk, bulkInsertKeluar } from '@/lib/db';
import { getCurrentUser } from '@/lib/storage';
import { formatDateTime } from '@/lib/date';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar, BackupData } from '@/types';

interface Props {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
  onRefresh: () => void;
}

export function BackupPage({ suratMasuk, suratKeluar, agendaPimpinan, onRefresh }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupData | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleBackup() {
    setBusy(true);
    try {
      const user = await getCurrentUser();
      const data: BackupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        suratMasuk,
        suratKeluar,
        agendaPimpinan,
      };
      exportBackup(data);
      toast('Backup berhasil diunduh.', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal membuat backup.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parseBackup(String(reader.result));
        setPendingRestore(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'File backup tidak valid.', 'error');
      }
    };
    reader.onerror = () => toast('Gagal membaca file.', 'error');
    reader.readAsText(file);
    e.target.value = '';
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setBusy(true);
    try {
      await Promise.all([clearTable('surat_masuk'), clearTable('surat_keluar')]);
      await bulkInsertMasuk(pendingRestore.suratMasuk);
      await bulkInsertKeluar(pendingRestore.suratKeluar);
      toast('Data berhasil dipulihkan.', 'success');
      onRefresh();
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal memulihkan data.'), 'error');
    } finally {
      setBusy(false);
      setPendingRestore(null);
    }
  }

  const total = suratMasuk.length + suratKeluar.length + agendaPimpinan.length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-[24px] border border-emerald-100/80 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Backup Data</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Cadangkan dan pulihkan data dari server cloud dengan pengalaman yang lebih bersih.</p>
      </div>

      {/* Stats */}
      <div className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-office-primary/10 flex items-center justify-center">
            <DatabaseBackup size={20} className="text-office-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-office-text dark:text-slate-100">Status Data Saat Ini</p>
            <p className="text-xs text-office-subtext dark:text-slate-400">{total} total data tersimpan di cloud</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-office-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs text-office-subtext dark:text-slate-400">Surat Masuk</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{suratMasuk.length}</p>
          </div>
          <div className="rounded-lg border border-office-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs text-office-subtext dark:text-slate-400">Surat Keluar</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{suratKeluar.length}</p>
          </div>
          <div className="rounded-lg border border-office-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs text-office-subtext dark:text-slate-400">Agenda Pimpinan</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{agendaPimpinan.length}</p>
          </div>
        </div>
      </div>

      {/* Export backup */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
            <Download size={20} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-office-text dark:text-slate-100">Export Backup</h3>
            <p className="text-xs text-office-subtext dark:text-slate-400">Unduh seluruh data sebagai file JSON untuk disimpan sebagai cadangan.</p>
          </div>
        </div>
        <Button onClick={handleBackup} disabled={busy || total === 0}>
          <Download size={16} /> Buat File Backup (.json)
        </Button>
      </div>

      {/* Import backup */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-office-border dark:border-slate-700 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
            <Upload size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-office-text dark:text-slate-100">Import / Restore Backup</h3>
            <p className="text-xs text-office-subtext dark:text-slate-400">Pulihkan data dari file backup JSON.</p>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Perhatian:</strong> Memulihkan backup akan mengganti seluruh data di cloud. Semua anggota keluarga akan melihat data hasil pemulihan. Pastikan Anda sudah mencadangkan data jika diperlukan.
          </p>
        </div>

        <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileJson size={16} /> Pilih File Backup
        </Button>
      </div>

      {/* Restore preview modal */}
      <Modal
        open={!!pendingRestore}
        onClose={() => setPendingRestore(null)}
        title="Konfirmasi Pemulihan Data"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingRestore(null)}>Batal</Button>
            <Button variant="danger" onClick={confirmRestore} disabled={busy}>Pulihkan Data</Button>
          </>
        }
      >
        {pendingRestore && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Seluruh data di cloud akan dihapus dan diganti dengan data dari file backup.
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 border border-office-border dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-office-subtext dark:text-slate-400">Surat Masuk</span>
                <span className="text-sm font-semibold text-office-text dark:text-slate-200">{pendingRestore.suratMasuk.length} data</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-office-subtext dark:text-slate-400">Surat Keluar</span>
                <span className="text-sm font-semibold text-office-text dark:text-slate-200">{pendingRestore.suratKeluar.length} data</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-office-subtext dark:text-slate-400">Agenda Pimpinan</span>
                <span className="text-sm font-semibold text-office-text dark:text-slate-200">{pendingRestore.agendaPimpinan?.length ?? 0} data</span>
              </div>
              {pendingRestore.exportedAt && (
                <div className="flex items-center justify-between pt-2 border-t border-office-border dark:border-slate-700">
                  <span className="text-sm text-office-subtext dark:text-slate-400">Backup dibuat</span>
                  <span className="text-sm font-medium text-office-text dark:text-slate-200">{formatDateTime(new Date(pendingRestore.exportedAt).getTime())}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={16} /> File backup valid dan siap dipulihkan.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
