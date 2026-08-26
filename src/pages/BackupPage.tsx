import { useRef, useState } from 'react';
import { Download, DatabaseBackup, AlertTriangle, CheckCircle2, FileJson, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Surface } from '@/components/ui/Surface';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { exportBackup, parseBackup } from '@/lib/export';
import { getErrorMessage } from '@/lib/error';
import { restoreBackup } from '@/lib/restore';
import { getCurrentUser } from '@/lib/storage';
import { formatDateTime } from '@/lib/date';
import type { AgendaPimpinan, SuratMasuk, SuratKeluar, BackupData } from '@/types';

interface Props {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
  onRefresh: () => void;
  /**
   * Restore replaces every record in all three tables. Only an admin may do it.
   * Defaults to false so an omitted prop fails closed, and so a caller that has
   * not yet resolved the signed-in user cannot open the restore path.
   */
  canRestore?: boolean;
}

/** One line of the "what the backup file contains" ledger in the restore
 *  confirmation. Label left, count right, so three of them scan as a column. */
function CountRow({ label, value, accent = '' }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-body text-office-subtext dark:text-slate-400">{label}</span>
      <span className={`text-body-strong tabular-nums ${accent || 'text-office-text dark:text-slate-100'}`}>{value}</span>
    </div>
  );
}

export function BackupPage({ suratMasuk, suratKeluar, agendaPimpinan, onRefresh, canRestore = false }: Props) {
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
    // Checked again at the executor, not only where the UI is rendered. A
    // restore clears all three tables before reinserting, and RLS cannot stop
    // a non-admin here: a DELETE policy's USING clause filters rows, it does
    // not raise. A staf restore would find zero deletable rows, succeed with
    // 204, then insert — duplicating the whole dataset instead of failing.
    if (!pendingRestore || !canRestore) return;
    setBusy(true);
    try {
      await restoreBackup(pendingRestore);
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
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title="Backup Data"
        icon={DatabaseBackup}
        description={`${total} data tersimpan di cloud · cadangkan atau pulihkan seluruh isi sistem.`}
      />

      {/* SAFE PATH — download. Available to everyone, so it leads. */}
      <Surface as="section" className="overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-heading text-office-text dark:text-slate-100">Unduh Backup</h2>
            <p className="mt-0.5 text-xs leading-5 text-office-subtext dark:text-slate-400">
              Menyimpan seluruh data sebagai satu file JSON di perangkat Anda. Tidak mengubah apa pun di cloud.
            </p>
          </div>
          <Button className="w-full sm:w-auto sm:shrink-0" onClick={handleBackup} disabled={busy || total === 0}>
            <Download size={16} /> Buat File Backup
          </Button>
        </div>
        {/* The ledger doubles as the page's data summary — three counts on one
            divided strip instead of three separate stat cards. */}
        <div className="grid divide-y divide-office-border border-t border-office-border dark:divide-slate-700/60 dark:border-slate-700 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: 'Surat Masuk', value: suratMasuk.length, accent: 'text-blue-600 dark:text-blue-400' },
            { label: 'Surat Keluar', value: suratKeluar.length, accent: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Agenda Pimpinan', value: agendaPimpinan.length, accent: 'text-amber-600 dark:text-amber-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block sm:px-5 sm:py-3.5"
            >
              <span className="text-xs text-office-subtext dark:text-slate-400">{s.label}</span>
              <span className={`text-title tabular-nums sm:mt-0.5 sm:block ${s.accent}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </Surface>

      {/* DESTRUCTIVE PATH — admin only. Hidden entirely rather than disabled:
          the file input, the picker button and every path that can set
          pendingRestore live in here, so the confirmation modal is unreachable
          for a non-admin. Export above stays available to everyone.

          Framed in rose, not amber, and separated from the download panel by
          its own danger header — restore is the one action on this page that
          destroys data for every user at once, and it must not read as the
          sibling of a harmless download. */}
      {canRestore && (
        <Surface as="section" className="overflow-hidden border-rose-200 dark:border-rose-500/40">
          <div className="flex items-start gap-3 border-b border-rose-200 bg-rose-50 px-4 py-3.5 dark:border-rose-500/40 dark:bg-rose-500/10 sm:px-5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300">
              <AlertTriangle size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-heading text-rose-800 dark:text-rose-200">Pulihkan dari Backup</h2>
              <p className="mt-0.5 text-xs leading-5 text-rose-700/90 dark:text-rose-300/90">
                Tindakan merusak — hanya admin.
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-body-strong text-office-text dark:text-slate-100">
                Memulihkan backup akan MENGHAPUS seluruh data di cloud.
              </p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-office-subtext dark:text-slate-400">
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                  Semua surat masuk, surat keluar, dan agenda pimpinan yang ada sekarang dihapus, lalu diganti dengan
                  isi file backup.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                  Berlaku untuk seluruh pengguna, bukan hanya perangkat ini. Tidak dapat dibatalkan.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                  Unduh backup terbaru lebih dulu jika data saat ini masih diperlukan.
                </li>
              </ul>
            </div>

            <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={busy}>
              <FileJson size={16} /> Pilih File Backup…
            </Button>
            <p className="text-xs text-office-subtext dark:text-slate-400">
              File akan diperiksa dan Anda masih harus mengonfirmasi sebelum data diganti.
            </p>
          </div>
        </Surface>
      )}

      {!canRestore && (
        <p className="flex items-start gap-2 px-1 text-xs leading-5 text-office-subtext dark:text-slate-400">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Pemulihan data dari file backup hanya tersedia untuk admin.
        </p>
      )}

      {/* Restore preview modal — also gated on canRestore, not only on
          pendingRestore. An admin can select a file, populating pendingRestore,
          and then have their role change before confirming; the modal must stop
          presenting a destructive confirmation the moment that happens rather
          than relying on confirmRestore() to reject it afterwards. */}
      <Modal
        open={canRestore && !!pendingRestore}
        onClose={() => setPendingRestore(null)}
        title="Konfirmasi Pemulihan Data"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingRestore(null)}>Batal</Button>
            <Button variant="danger" onClick={confirmRestore} disabled={busy}>Ganti Seluruh Data</Button>
          </>
        }
      >
        {pendingRestore && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-control border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/40 dark:bg-rose-500/10">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <div className="space-y-1 text-rose-800 dark:text-rose-200">
                <p className="text-body-strong">Seluruh data di cloud akan dihapus.</p>
                <p className="text-xs leading-5">
                  Data yang ada sekarang diganti dengan isi file backup di bawah, untuk semua pengguna. Tindakan ini
                  tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <div className="rounded-control border border-office-border bg-slate-50 px-3.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="pt-1.5 text-label uppercase text-office-subtext dark:text-slate-400">Isi file backup</p>
              <div className="divide-y divide-office-border dark:divide-slate-700/60">
                <CountRow label="Surat Masuk" value={pendingRestore.suratMasuk.length} />
                <CountRow label="Surat Keluar" value={pendingRestore.suratKeluar.length} />
                <CountRow label="Agenda Pimpinan" value={pendingRestore.agendaPimpinan?.length ?? 0} />
                {pendingRestore.exportedAt && (
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <span className="text-body text-office-subtext dark:text-slate-400">Backup dibuat</span>
                    <span className="text-body-strong text-office-text dark:text-slate-100">
                      {formatDateTime(new Date(pendingRestore.exportedAt).getTime())}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={15} aria-hidden="true" /> File backup valid dan siap dipulihkan.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
