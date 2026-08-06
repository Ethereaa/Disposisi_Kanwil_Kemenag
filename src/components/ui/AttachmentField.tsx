import { useEffect, useRef, useState } from 'react';
import type { DragEvent, TouchEvent } from 'react';
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
  Download,
  Layers,
  GripVertical,
  SunMedium,
  Contrast,
  Crop,
} from 'lucide-react';
import type { Attachment } from '@/types';
import {
  uploadAttachment,
  deleteAttachment,
  getAttachmentUrl,
  photosToPdf,
  mergeAttachmentsToPdf,
  getPdfPageCount,
} from '@/lib/attachments';
import type { ScanMode } from '@/lib/attachments';
import { detectDocumentCorners, warpPerspective } from '@/lib/documentDetection';
import type { Quad } from '@/lib/documentDetection';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';
import { CornerAdjustModal } from './CornerAdjustModal';

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

interface CropQueueItem {
  original: File;
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  corners: Quad;
  reliable: boolean;
}

function fileToDataUrlLocal(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageLocal(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar.'));
    img.src = dataUrl;
  });
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
  const [scanMode, setScanMode] = useState<ScanMode>('original');
  const [autoCrop, setAutoCrop] = useState(false);
  // Sequential review queue for auto-crop: one photo reviewed at a time via
  // CornerAdjustModal, since auto-detection on a phone photo needs a human
  // confirming (or dragging to fix) the corners before we commit to a crop.
  const [cropQueue, setCropQueue] = useState<CropQueueItem[] | null>(null);
  const [cropIndex, setCropIndex] = useState(0);
  const cropResolverRef = useRef<((files: File[]) => void) | null>(null);
  const cropResultsRef = useRef<File[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mergedBusy, setMergedBusy] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<{ current: number; total: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const pageCountFetched = useRef<Set<string>>(new Set());
  // Swipe-to-delete (mobile): `swipe.path` is the item currently tracking a
  // touch drag, `swipe.offset` its live horizontal translateX. `revealedPath`
  // is the item left "open" (action button showing) after a swipe past
  // threshold — the reveal is the confirmation step, deletion only happens
  // if the user then taps the revealed button.
  const [swipe, setSwipe] = useState<{ path: string; startX: number; startY: number; base: number; offset: number } | null>(
    null,
  );
  const [revealedPath, setRevealedPath] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pickInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetches & caches the page count of each PDF attachment (for the badge
  // in the list). Keyed by path via `pageCountFetched` so a page count is
  // only ever requested once per attachment, no matter how many times this
  // component re-renders or `value` changes for unrelated reasons.
  useEffect(() => {
    // Read-only views (surat/agenda detail modals) don't need the page
    // count badge enough to justify downloading every attached PDF's full
    // bytes just to open a detail view — that count is still one tap away
    // via "Lihat" (handleView), which already needs to fetch the file.
    if (readOnly) return;
    const pending = value.filter(
      (a) => a.type === 'application/pdf' && a.path !== '__merged__' && !pageCountFetched.current.has(a.path),
    );
    if (pending.length === 0) return;
    pending.forEach((a) => pageCountFetched.current.add(a.path));
    let cancelled = false;
    (async () => {
      for (const a of pending) {
        try {
          const count = await getPdfPageCount(a.path);
          if (!cancelled) setPageCounts((prev) => ({ ...prev, [a.path]: count }));
        } catch {
          // Allow a retry on a later render instead of leaving the badge
          // permanently blank because of a transient network error.
          pageCountFetched.current.delete(a.path);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, readOnly]);

  // Photo(s) picked in one go — whether from the camera or the file picker
  // — are turned into PDF attachment(s) automatically. In "single" mode
  // (default) they're merged into ONE multi-page PDF, for a multi-page
  // letter photographed page by page. In "batch" mode each photo becomes
  // its OWN separate PDF attachment — for scanning several different
  // letters back-to-back without them getting merged into one file.
  // A file that's already a PDF is uploaded as-is either way.
  // Runs corner detection on each photo up front, then resolves only once
  // the user has confirmed or skipped a crop for every one of them — the
  // returned Files replace the originals (only for photos where a crop was
  // confirmed) before they continue into the existing photosToPdf pipeline.
  async function reviewCrops(images: File[]): Promise<File[]> {
    const items: CropQueueItem[] = [];
    for (const original of images) {
      const dataUrl = await fileToDataUrlLocal(original);
      const img = await loadImageLocal(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const { corners, reliable } = ctx
        ? detectDocumentCorners(canvas)
        : { corners: [{ x: 0, y: 0 }, { x: img.naturalWidth, y: 0 }, { x: img.naturalWidth, y: img.naturalHeight }, { x: 0, y: img.naturalHeight }] as Quad, reliable: false };
      items.push({ original, dataUrl, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, corners, reliable });
    }
    return new Promise((resolve) => {
      cropResultsRef.current = [];
      cropResolverRef.current = resolve;
      setCropQueue(items);
      setCropIndex(0);
    });
  }

  function advanceCropQueue() {
    setCropQueue((queue) => {
      if (!queue) return null;
      if (cropIndex + 1 < queue.length) {
        setCropIndex(cropIndex + 1);
        return queue;
      }
      const resolve = cropResolverRef.current;
      cropResolverRef.current = null;
      resolve?.(cropResultsRef.current);
      return null;
    });
  }

  function handleCropConfirm(corners: Quad) {
    if (!cropQueue) return;
    const item = cropQueue[cropIndex];
    const img = new Image();
    img.onload = () => {
      const warped = warpPerspective(img, corners);
      warped.toBlob((blob) => {
        const file = blob ? new File([blob], item.original.name, { type: 'image/jpeg' }) : item.original;
        cropResultsRef.current.push(file);
        advanceCropQueue();
      }, 'image/jpeg', 0.9);
    };
    img.onerror = () => {
      // If re-decoding somehow fails, fall back to the uncropped original
      // rather than dropping the photo from the batch entirely.
      cropResultsRef.current.push(item.original);
      advanceCropQueue();
    };
    img.src = item.dataUrl;
  }

  function handleCropSkip() {
    if (!cropQueue) return;
    cropResultsRef.current.push(cropQueue[cropIndex].original);
    advanceCropQueue();
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    setProgress(null);
    try {
      const pdfs = files.filter((f) => f.type === 'application/pdf');
      let images = files.filter((f) => f.type.startsWith('image/'));

      if (autoCrop && images.length > 0) {
        setProgress({ label: 'Mendeteksi sudut dokumen...', current: 0, total: images.length });
        images = await reviewCrops(images);
      }

      const uploaded: Attachment[] = [];

      if (images.length > 0) {
        if (photoMode === 'batch') {
          for (let i = 0; i < images.length; i++) {
            setProgress({ label: `Memproses dokumen ${i + 1}/${images.length}...`, current: i, total: images.length });
            const { file, thumbnail } = await photosToPdf(
              [images[i]],
              `scan-${Date.now()}-${i + 1}`,
              undefined,
              scanMode,
            );
            uploaded.push(await uploadAttachment(file, folder, thumbnail));
            setProgress({ label: `Mengupload dokumen ${i + 1}/${images.length}...`, current: i + 1, total: images.length });
          }
        } else {
          const { file, thumbnail } = await photosToPdf(
            images,
            `scan-${Date.now()}`,
            (current, total) => {
              setProgress({ label: `Memproses foto ${current}/${total}...`, current, total });
            },
            scanMode,
          );
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
    setMergeProgress({ current: 0, total: list.length });
    setPreview({ attachment: synthetic, url: null, loading: true });
    try {
      const blob = await mergeAttachmentsToPdf(list, (current, total) => {
        setMergeProgress({ current, total });
      });
      const url = URL.createObjectURL(blob);
      setPreview({ attachment: synthetic, url, loading: false });
    } catch {
      toast('Gagal menggabungkan lampiran.', 'error');
      setPreview(null);
    } finally {
      setMergedBusy(false);
      setMergeProgress(null);
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

  // Native HTML5 drag-and-drop reorder. Order matters here beyond display —
  // mergeAttachmentsToPdf() concatenates pages in list order, so reordering
  // this list is how staff control page order in the combined PDF.
  function handleDragStart(index: number) {
    setDragIndex(index);
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }
  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      return;
    }
    const next = [...value];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDragIndex(null);
  }

  function startRename(a: Attachment) {
    setEditingPath(a.path);
    setEditingName(a.name);
  }
  // Rename only updates the display name in the `lampiran` metadata array —
  // the file in Storage keeps its original random path, so no re-upload.
  function commitRename(a: Attachment) {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== a.name) {
      onChange(value.map((x) => (x.path === a.path ? { ...x, name: trimmed } : x)));
    }
    setEditingPath(null);
  }
  function cancelRename() {
    setEditingPath(null);
  }

  // Swipe-to-delete (mobile). Note: the drag-to-reorder above is native
  // HTML5 drag-and-drop, which mobile browsers don't drive from touch
  // input at all (no dragstart fires on touch without a polyfill) — so in
  // practice reorder is a desktop-mouse-only interaction today, and these
  // touch handlers don't compete with it for the same gesture.
  //
  // A swipe left past SWIPE_THRESHOLD reveals a "Hapus" action button
  // instead of deleting immediately — the button tap is the confirmation
  // step, so nothing is ever deleted from a swipe alone.
  const SWIPE_THRESHOLD = 56;
  const SWIPE_MAX = 88;

  function handleSwipeStart(e: TouchEvent<HTMLDivElement>, path: string) {
    if (readOnly || editingPath) return;
    const t = e.touches[0];
    const base = revealedPath === path ? -SWIPE_MAX : 0;
    setSwipe({ path, startX: t.clientX, startY: t.clientY, base, offset: base });
  }
  function handleSwipeMove(e: TouchEvent<HTMLDivElement>, path: string) {
    if (!swipe || swipe.path !== path) return;
    const t = e.touches[0];
    const dx = t.clientX - swipe.startX;
    const dy = t.clientY - swipe.startY;
    // If the gesture is more vertical than horizontal, treat it as a page
    // scroll and bail out instead of hijacking it.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      setSwipe(null);
      return;
    }
    // Not calling preventDefault() here: React attaches touchmove listeners
    // as passive by default, so it wouldn't take effect anyway (and would
    // just log a console warning). `touch-pan-y` below does the equivalent
    // job at the CSS level — the browser keeps vertical scroll native and
    // leaves horizontal movement to us.
    const offset = Math.min(0, Math.max(swipe.base + dx, -SWIPE_MAX));
    setSwipe({ ...swipe, offset });
  }
  function handleSwipeEnd() {
    if (!swipe) return;
    setRevealedPath(swipe.offset <= -SWIPE_THRESHOLD ? swipe.path : null);
    setSwipe(null);
  }

  async function handleDownload(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast('Gagal mengunduh PDF.', 'error');
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
          </div>

          {/* Scan filter — applied to camera/gallery photos only (not PDFs
              picked directly) via enhanceScanImage() before they're placed
              into the PDF. Purely canvas-based, see attachments.ts. */}
          <div className="flex items-center gap-1 rounded-lg border border-office-border bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setScanMode('original')}
              title="Tanpa filter, hanya diperkecil ukurannya"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${scanMode === 'original' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
            >
              <ImageIcon size={12} /> Warna Asli
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setScanMode('bright')}
              title="Kontras & kecerahan dinaikkan, teks dipertajam — mirip mode scan CamScanner"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${scanMode === 'bright' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
            >
              <SunMedium size={12} /> Scan Terang
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setScanMode('bw')}
              title="Hitam-putih tegas seperti scan dokumen resmi"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${scanMode === 'bw' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
            >
              <Contrast size={12} /> Hitam Putih
            </button>
          </div>

          {/* Auto-crop + perspective-correct: detects the document's 4
              corners (white paper vs. darker desk/background) and lets the
              user confirm/adjust them before the photo is cropped and
              straightened — see documentDetection.ts + CornerAdjustModal. */}
          <div className="flex items-center gap-1 rounded-lg border border-office-border bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setAutoCrop((v) => !v)}
              title="Deteksi & luruskan otomatis batas dokumen dari foto (bisa dikoreksi manual sebelum diterapkan)"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${autoCrop ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
            >
              <Crop size={12} /> Auto-Crop Dokumen
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
          {mergedBusy && mergeProgress
            ? `Menggabungkan ${mergeProgress.current}/${mergeProgress.total} dokumen...`
            : `Preview Semua (${value.length} dokumen)`}
        </button>
      )}

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a, index) => {
            const isPdf = a.type === 'application/pdf';
            const isEditing = editingPath === a.path;
            const isDragging = dragIndex === index;
            const swipeOffset = swipe && swipe.path === a.path ? swipe.offset : revealedPath === a.path ? -SWIPE_MAX : 0;
            return (
              <li key={a.path} className="relative overflow-hidden rounded-lg">
                {/* Revealed by a left swipe; sits behind the row and only
                    acts as the actual delete trigger once tapped — the
                    reveal itself is not a delete. */}
                {!readOnly && (
                  <div className="absolute inset-y-0 right-0 flex w-[88px] items-stretch">
                    <button
                      type="button"
                      onClick={() => {
                        setRevealedPath(null);
                        void handleDelete(a);
                      }}
                      className="flex w-full flex-col items-center justify-center gap-0.5 bg-red-500 text-xs font-medium text-white active:bg-red-600"
                    >
                      <Trash2 size={16} />
                      Hapus
                    </button>
                  </div>
                )}
                <div
                  draggable={!readOnly && !isEditing}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => setDragIndex(null)}
                  onTouchStart={(e) => handleSwipeStart(e, a.path)}
                  onTouchMove={(e) => handleSwipeMove(e, a.path)}
                  onTouchEnd={handleSwipeEnd}
                  style={{ transform: `translateX(${swipeOffset}px)` }}
                  className={`flex items-center gap-2 touch-pan-y rounded-lg border border-office-border bg-slate-50 px-3 py-2 text-sm transition-transform dark:border-slate-700 dark:bg-slate-900/40 ${isDragging ? 'opacity-40' : ''} ${swipe?.path === a.path ? '' : 'duration-200'}`}
                >
                  {!readOnly && (
                  <span
                    className="shrink-0 cursor-grab text-office-subtext active:cursor-grabbing dark:text-slate-500"
                    title="Geser untuk mengubah urutan"
                  >
                    <GripVertical size={15} />
                  </span>
                )}
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
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitRename(a)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(a);
                      if (e.key === 'Escape') cancelRename();
                    }}
                    className="flex-1 min-w-0 rounded-md border border-office-primary bg-white px-1.5 py-0.5 text-sm text-office-text focus:outline-none dark:border-emerald-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                ) : (
                  <span
                    className={`flex-1 truncate text-office-text dark:text-slate-200 ${!readOnly ? 'cursor-text hover:underline' : ''}`}
                    title={readOnly ? a.name : 'Klik untuk ubah nama'}
                    onClick={() => !readOnly && startRename(a)}
                  >
                    {a.name}
                  </span>
                )}
                {isPdf && pageCounts[a.path] !== undefined && (
                  <span
                    className="shrink-0 rounded-full bg-office-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-office-primary dark:bg-emerald-900/40 dark:text-emerald-400"
                    title="Jumlah halaman"
                  >
                    {pageCounts[a.path]} hlm
                  </span>
                )}
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
                </div>
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
            <>
              {preview.attachment.type === 'application/pdf' && (
                <button
                  type="button"
                  onClick={() => handleDownload(preview.url as string, preview.attachment.name)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-office-primary hover:underline dark:text-emerald-400"
                >
                  <Download size={14} /> Unduh PDF Gabungan
                </button>
              )}
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-office-primary hover:underline dark:text-emerald-400"
              >
                <ExternalLink size={14} /> Buka di tab baru
              </a>
            </>
          ) : undefined
        }
      >
        {preview && preview.loading && (
          <div className="space-y-2">
            {mergeProgress && (
              <p className="text-center text-sm font-medium text-office-text dark:text-slate-200">
                Menggabungkan {mergeProgress.current}/{mergeProgress.total} dokumen...
              </p>
            )}
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

      {cropQueue && cropQueue[cropIndex] && (
        <CornerAdjustModal
          open
          imageDataUrl={cropQueue[cropIndex].dataUrl}
          naturalWidth={cropQueue[cropIndex].naturalWidth}
          naturalHeight={cropQueue[cropIndex].naturalHeight}
          corners={cropQueue[cropIndex].corners}
          reliable={cropQueue[cropIndex].reliable}
          progressLabel={cropQueue.length > 1 ? `${cropIndex + 1}/${cropQueue.length}` : undefined}
          onConfirm={handleCropConfirm}
          onSkip={handleCropSkip}
        />
      )}
    </div>
  );
}
