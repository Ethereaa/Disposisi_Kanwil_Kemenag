import { supabase } from './supabase';
import type { Attachment } from '@/types';

const BUCKET = 'lampiran-surat';

// Defensive: `lampiran` comes back from Postgres as jsonb, so on old rows
// (created before this column existed, or if it's ever null) normalize to
// an empty array instead of letting `undefined`/`null` leak into the UI.
export function normalizeLampiran(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Attachment =>
      !!v && typeof v === 'object' && typeof (v as Attachment).path === 'string',
  );
}

function extOf(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

// Uploads one file into the given folder ("surat-masuk" / "surat-keluar" /
// "agenda-pimpinan") under a random, collision-proof name and returns the
// metadata to store in the record's `lampiran` column. `thumbnail`, if
// given, is stored inline in that same jsonb metadata (not as a separate
// Storage object) so lists/tables can show a preview without an extra
// signed-URL round-trip.
export async function uploadAttachment(file: File, folder: string, thumbnail?: string): Promise<Attachment> {
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extOf(file.name)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return {
    path,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

export async function deleteAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// The bucket is private, so viewing an attachment requires a short-lived
// signed URL generated on demand (valid 1 hour) rather than a permanent
// public link.
export async function getAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar.'));
    img.src = dataUrl;
  });
}

// Downscales a captured photo before it goes into the PDF — phone camera
// photos are often 3000-4000px wide (several MB each), which makes for a
// huge, slow-to-upload PDF over mobile data. 1600px on the long edge is
// still plenty sharp for a scanned letter.
async function resizedJpeg(file: File, maxDim = 1600, quality = 0.75): Promise<{ dataUrl: string; w: number; h: number }> {
  const original = await fileToDataUrl(file);
  const img = await loadImage(original);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: original, w: img.naturalWidth, h: img.naturalHeight };
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), w, h };
}

// Merges one or more photos (each page of a letter) into a single PDF file,
// so "foto pakai HP" always ends up as one PDF attachment automatically —
// no separate scanning app needed for multi-page letters.
//
// `onProgress(current, total)` fires after each photo is processed, so the
// caller can show "Memproses foto 2/3..." instead of a generic spinner —
// useful since this can take a while on low-end phones. The returned
// `thumbnail` is a small preview (from the first photo) for use in
// list/table previews, generated here since we already have the image
// decoded in memory.
export async function photosToPdf(
  files: File[],
  fileName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ file: File; thumbnail: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let thumbnail = '';

  for (let i = 0; i < files.length; i++) {
    const { dataUrl, w, h } = await resizedJpeg(files[i]);
    if (i === 0) {
      thumbnail = (await resizedJpeg(files[0], 160, 0.5)).dataUrl;
    }
    const scale = Math.min(pageW / w, pageH / h);
    const drawW = w * scale;
    const drawH = h * scale;
    if (i > 0) doc.addPage();
    doc.addImage(dataUrl, 'JPEG', (pageW - drawW) / 2, (pageH - drawH) / 2, drawW, drawH);
    onProgress?.(i + 1, files.length);
  }

  const blob = doc.output('blob');
  const safeName = fileName.replace(/\.pdf$/i, '') || 'scan';
  const file = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
  return { file, thumbnail };
}
