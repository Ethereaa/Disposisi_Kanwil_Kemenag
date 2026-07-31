import { useRef, useState } from 'react';
import {
  Camera,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  Eye,
  Trash2,
  Loader2,
  Paperclip,
  Copy,
  ExternalLink,
  Layers,
} from 'lucide-react';
import type { Attachment } from '@/types';
import { uploadAttachment, deleteAttachment, getAttachmentUrl, photosToPdf, mergeAttachmentsToPdf } from '@/lib/attachments';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';

interface Props {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Storage sub-folder, e.g. "surat-masuk" / "surat-keluar" / "agenda-pimpinan". */
  folder: string;
  disabled?: boolean;
  /** View-only mode (detail modals): hides upload buttons and the delete action. */
  readOnly?: boolean;
}

/** How multiple photos taken/picked in one go are turned into attachments. */
type PhotoMode = 'single' | 'batch';

interface ProgressState {
  label: string;
  current: number;
  total: number;
}

interface PreviewState {
  attachment: Attachment;
  url: string | null;
  loading: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentField({ value, onChange, folder, disabled, readOnly }: Props) {
  const [busy, setBusy] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [photoMode, setPhotoMode] = useState<PhotoMode>('single');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mergedBusy, setMergedBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pickInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Photo(s) picked in one go — whether from the camera or the file picker
  // — are turned into PDF attachment(s) automatically. In "single" mode
  // (default) they're merged into ONE multi-page PDF, for a multi-page
  // letter photographed page by page. In "batch" mode each photo becomes
  // its OWN separate PDF attachment — for scanning several different
  // letters back-to-back without them getting merged into one file.
  // A file that's already a PDF is uploaded as-is either way.
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    setProgress(null);
    try {
      const pdfs = files.filter((f) => f.type === 'application/pdf');
      const images = files.filter((f) => f.type.startsWith('image/'));

      const uploaded: Attachment[] = [];

      if (images.length > 0) {
        if (photoMode === 'batch') {
          for (let i = 0; i < images.length; i++) {
            setProgress({ label: `Memproses dokumen ${i + 1}/${images.length}...`, current: i, total: images.length });
            const { file, thumbnail } = await photosToPdf([images[i]], `scan-${Date.now()}-${i + 1}`);
            uploaded.push(await uploadAttachment(file, folder, thumbnail));
            setProgress({ label: `Mengupload dokumen ${i + 1}/${images.length}...`, current: i + 1, total: images.length });
          }
        } else {
          const { file, thumbnail } = await photosToPdf(images, `scan-${Date.now()}`, (current, total) => {
            setProgress({ label: `Memproses foto ${current}/${total}...`, current, total });
          });
          setProgress({ label: 'Mengupload dokumen...', current: images.length, total: images.length });
          uploaded.push(await uploadAttachment(file, folder, thumbnail));
        }
      }
      for (let i = 0; i < pdfs.length; i++) {
        setProgress({ label: `Mengupload PDF ${i + 1}/${pdfs.length}...`, current: i, total: pdfs.length });
        uploaded.push(await uploadAttachment(pdfs[i], folder));
      }

      if (uploaded.length > 0) {
        onChange([...value, ...uploaded]);
        toast(
          uploaded.length > 1 ? `${uploaded.length} lampiran berhasil diupload.` : 'Lampiran berhasil diupload.',
          'success',
        );
        // Batch mode keeps each scanned document as its own attachment
        // (so they stay individually deletable), but reviewing several
        // of them one-by-one is tedious — so as soon as a batch produces
        // more than one document, immediately show them combined into a
        // single merged PDF, one click, no extra button press needed.
        if (photoMode === 'batch' && uploaded.length > 1) {
          void handleViewMerged(uploaded);
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengupload lampiran.', 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleView(a: Attachment) {
    setPreview({ attachment: a, url: null, loading: true });
    try {
      const url = await getAttachmentUrl(a.path);
      setPreview({ attachment: a, url, loading: false });
    } catch {
      toast('Gagal membuka lampiran.', 'error');
      setPreview(null);
    }
  }

  // Combines several attachments into one throwaway PDF (nothing is
  // re-uploaded) so they can be reviewed in the same preview modal with
  // a single click, instead of opening each document one at a time.
  async function handleViewMerged(list: Attachment[]) {
    const synthetic: Attachment = {
      path: '__merged__',
      name: `Gabungan ${list.length} Lampiran.pdf`,
      type: 'application/pdf',
      size: 0,
    };
    setMergedBusy(true);
    setPreview({ attachment: synthetic, url: null, loading: true });
    try {
      const blob = await mergeAttachmentsToPdf(list);
      const url = URL.createObjectURL(blob);
      setPreview({ attachment: synthetic, url, loading: false });
    } catch {
      toast('Gagal menggabungkan lampiran.', 'error');
      setPreview(null);
    } finally {
      setMergedBusy(false);
    }
  }

  function closePreview() {
    if (preview?.url?.startsWith('blob:')) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function handleDelete(a: Attachment) {
    setBusyPath(a.path);
    try {
      await deleteAttachment(a.path);
      onChange(value.filter((x) => x.path !== a.path));
    } catch {
      toast('Gagal menghapus lampiran.', 'error');
    } finally {
      setBusyPath(null);
    }
  }

  const isDisabled = disabled || busy;
  const progressPct = progress ? Math.round((progress.current / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              Ambil Foto
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => pickInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <FolderOpen size={15} />
              Pilih File
            </button>

            {/* Single-document vs batch: controls what happens when more than
                one photo is captured/picked in the same go (see handleFiles). */}
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-office-border bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => setPhotoMode('single')}
                title="Beberapa foto digabung jadi 1 PDF multi-halaman"
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${photoMode === 'single' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
              >
                <FileText size={12} /> 1 Dokumen
              </button>
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => setPhotoMode('batch')}
                title="Tiap foto jadi dokumen terpisah"
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${photoMode === 'batch' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
              >
                <Copy size={12} /> Batch
              </button>
            </div>

            {/* Opens the phone camera directly. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {/* Opens the normal OS file picker — from here the user can also
                reach Google Drive, Files, Gallery/Photos (incl. images saved
                from WhatsApp), or any other app that exposes files/documents. */}
            <input
              ref={pickInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <p className="text-xs text-office-subtext dark:text-slate-400">
            PDF/foto surat asli — otomatis jadi PDF.{' '}
            {photoMode === 'single'
              ? 'Beberapa foto sekaligus akan digabung jadi 1 dokumen (multi-halaman).'
              : 'Mode Batch: tiap foto jadi dokumen terpisah (cocok untuk beberapa surat sekaligus) — setelah upload, semuanya otomatis ditampilkan gabungan dalam 1 preview PDF.'}
          </p>

          {progress && (
            <div className="space-y-1 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-medium text-office-text dark:text-slate-200">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-office-primary" /> {progress.label}
                </span>
                <span className="tabular-nums text-office-subtext dark:text-slate-400">{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white dark:bg-slate-700/60">
                <div
                  className="h-full rounded-full bg-office-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {value.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-office-subtext dark:text-slate-400">
          <Paperclip size={13} /> {readOnly ? 'Tidak ada lampiran.' : 'Belum ada lampiran.'}
        </p>
      )}

      {value.length > 1 && (
        <button
          type="button"
          disabled={mergedBusy}
          onClick={() => handleViewMerged(value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-office-primary hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-emerald-400 dark:hover:bg-slate-700"
          title="Gabungkan semua lampiran jadi satu PDF untuk dilihat sekaligus"
        >
          {mergedBusy ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
          Preview Semua ({value.length} dokumen)
        </button>
      )}

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a) => {
            const isPdf = a.type === 'application/pdf';
            return (
              <li
                key={a.path}
                className="flex items-center gap-2 rounded-lg border border-office-border bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
              >
                {a.thumbnail ? (
                  <button
                    type="button"
                    onClick={() => handleView(a)}
                    className="shrink-0 overflow-hidden rounded-md border border-office-border dark:border-slate-600"
                    title="Lihat"
                  >
                    <img src={a.thumbnail} alt="" className="h-9 w-9 object-cover" />
                  </button>
                ) : isPdf ? (
                  <FileText size={16} className="shrink-0 text-rose-500" />
                ) : (
                  <ImageIcon size={16} className="shrink-0 text-blue-500" />
                )}
                <span className="flex-1 truncate text-office-text dark:text-slate-200" title={a.name}>{a.name}</span>
                <span className="shrink-0 text-xs text-office-subtext dark:text-slate-400">{formatSize(a.size)}</span>
                <button
                  type="button"
                  onClick={() => handleView(a)}
                  className="shrink-0 rounded-md p-1 text-office-subtext hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40"
                  title="Lihat"
                >
                  <Eye size={15} />
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    disabled={busyPath === a.path}
                    onClick={() => handleDelete(a)}
                    className="shrink-0 rounded-md p-1 text-office-subtext hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/40"
                    title="Hapus"
                  >
                    {busyPath === a.path ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* In-place preview: images/PDFs open here instead of a new tab, so
          staff scanning multiple letters don't have to leave the page. */}
      <Modal
        open={!!preview}
        onClose={closePreview}
        title={preview?.attachment.name}
        size="xl"
        footer={
          preview && preview.url ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-office-primary hover:underline dark:text-emerald-400"
            >
              <ExternalLink size={14} /> Buka di tab baru
            </a>
          ) : undefined
        }
      >
        {preview && preview.loading && (
          <div className="space-y-2">
            <Skeleton className="h-[60vh] w-full" />
          </div>
        )}
        {preview && !preview.loading && preview.url && (
          preview.attachment.type === 'application/pdf' ? (
            <iframe
              src={preview.url}
              title={preview.attachment.name}
              className="h-[75vh] w-full rounded-lg border border-office-border dark:border-slate-700"
            />
          ) : (
            <img
              src={preview.url}
              alt={preview.attachment.name}
              className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain"
            />
          )
        )}
      </Modal>
    </div>
  );
}
