import { useRef, useState } from 'react';
import { Camera, FolderOpen, FileText, Image as ImageIcon, Eye, Trash2, Loader2, Paperclip } from 'lucide-react';
import type { Attachment } from '@/types';
import { uploadAttachment, deleteAttachment, getAttachmentUrl, photosToPdf } from '@/lib/attachments';
import { useToast } from './Toast';

interface Props {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Storage sub-folder, e.g. "surat-masuk" / "surat-keluar" / "agenda-pimpinan". */
  folder: string;
  disabled?: boolean;
  /** View-only mode (detail modals): hides upload buttons and the delete action. */
  readOnly?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentField({ value, onChange, folder, disabled, readOnly }: Props) {
  const [busy, setBusy] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pickInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Any image(s) picked in one go — whether from the camera or the file
  // picker — are merged into a single PDF automatically, so a multi-page
  // letter photographed page by page still ends up as one PDF attachment.
  // A file that's already a PDF is uploaded as-is.
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    try {
      const pdfs = files.filter((f) => f.type === 'application/pdf');
      const images = files.filter((f) => f.type.startsWith('image/'));

      const uploaded: Attachment[] = [];

      if (images.length > 0) {
        const merged = await photosToPdf(images, `scan-${Date.now()}`);
        uploaded.push(await uploadAttachment(merged, folder));
      }
      for (const pdf of pdfs) {
        uploaded.push(await uploadAttachment(pdf, folder));
      }

      if (uploaded.length > 0) {
        onChange([...value, ...uploaded]);
        toast(
          uploaded.length > 1 ? `${uploaded.length} lampiran berhasil diupload.` : 'Lampiran berhasil diupload.',
          'success',
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengupload lampiran.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleView(a: Attachment) {
    try {
      const url = await getAttachmentUrl(a.path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast('Gagal membuka lampiran.', 'error');
    }
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

  return (
    <div className="space-y-3">
      {!readOnly && (
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
          <span className="text-xs text-office-subtext dark:text-slate-400">PDF/foto surat asli — otomatis jadi PDF</span>

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
      )}

      {value.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-office-subtext dark:text-slate-400">
          <Paperclip size={13} /> {readOnly ? 'Tidak ada lampiran.' : 'Belum ada lampiran.'}
        </p>
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
                {isPdf ? <FileText size={16} className="shrink-0 text-rose-500" /> : <ImageIcon size={16} className="shrink-0 text-blue-500" />}
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
    </div>
  );
}
