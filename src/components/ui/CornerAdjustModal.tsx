import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Check, ScanLine, Crop } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { Point, Quad } from '@/lib/documentDetection';

interface Props {
  open: boolean;
  imageDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  corners: Quad;
  reliable: boolean;
  /** e.g. "Foto 2/3" so a batch review shows progress. */
  progressLabel?: string;
  onConfirm: (corners: Quad) => void;
  onSkip: () => void;
}

const MAX_W = 420;
const MAX_H = 520;
const HANDLE_LABELS = ['Kiri Atas', 'Kanan Atas', 'Kanan Bawah', 'Kiri Bawah'];

/** Arrow-key step, and the coarse step with Shift held. */
const NUDGE = 1;
const NUDGE_FAST = 10;

const ARROW_DELTA: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Lets the user verify/adjust the 4 detected document corners on a photo
 * before it's cropped + perspective-corrected — auto-detection on a phone
 * photo is rarely 100% accurate, so this confirmation step is not optional.
 *
 * The handles are real HTML `<button>`s absolutely positioned over the photo,
 * not the SVG `<circle>`s they used to be: circles took pointer events but
 * were not focusable, so a keyboard-only user could only accept or skip
 * whatever the detector guessed, never correct it. As buttons they are tab
 * stops that nudge with the arrow keys, and their 48px hitbox clears the
 * touch floor while the visible dot stays 24px.
 * Pointer Events (not the touch handlers used elsewhere in this codebase)
 * because corner-dragging has to work from mouse and touch alike.
 */
export function CornerAdjustModal({
  open,
  imageDataUrl,
  naturalWidth,
  naturalHeight,
  corners,
  reliable,
  progressLabel,
  onConfirm,
  onSkip,
}: Props) {
  const ratio = Math.min(MAX_W / Math.max(1, naturalWidth), MAX_H / Math.max(1, naturalHeight), 1);
  const renderW = Math.max(1, Math.round(naturalWidth * ratio));
  const renderH = Math.max(1, Math.round(naturalHeight * ratio));

  const [points, setPoints] = useState<Quad>(() => corners.map((p) => ({ x: p.x * ratio, y: p.y * ratio })) as Quad);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Announced only on keyboard nudges — a pointer drag is already visible to
  // whoever is doing it, and announcing every move event would be noise.
  const [liveMessage, setLiveMessage] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);

  // Re-derive the starting points whenever a new photo (new `corners`) is
  // handed to this modal instance — cheap key-based reset instead of a
  // useEffect, since the parent always mounts one modal per queue item.
  const [lastCornersRef] = useState({ current: corners });
  if (lastCornersRef.current !== corners) {
    lastCornersRef.current = corners;
    setPoints(corners.map((p) => ({ x: p.x * ratio, y: p.y * ratio })) as Quad);
    setLiveMessage('');
  }

  function clamp(p: Point): Point {
    return { x: Math.max(0, Math.min(renderW, p.x)), y: Math.max(0, Math.min(renderH, p.y)) };
  }

  function movePoint(index: number, to: Point) {
    const next = clamp(to);
    setPoints((prev) => {
      const copy = [...prev] as Quad;
      copy[index] = next;
      return copy;
    });
    return next;
  }

  function handlePointerDown(index: number, e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(index);
  }
  function handlePointerMove(index: number, e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragIndex !== index) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    movePoint(index, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragIndex(null);
  }

  function handleKeyDown(index: number, e: ReactKeyboardEvent<HTMLButtonElement>) {
    const delta = ARROW_DELTA[e.key];
    if (!delta) return;
    // Otherwise the arrow key scrolls the modal body instead of moving the
    // corner the user is holding.
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_FAST : NUDGE;
    const from = points[index];
    const moved = movePoint(index, { x: from.x + delta.x * step, y: from.y + delta.y * step });
    setLiveMessage(`${HANDLE_LABELS[index]}: ${Math.round(moved.x)}, ${Math.round(moved.y)}`);
  }

  function confirm() {
    const inv = 1 / ratio;
    onConfirm(points.map((p) => ({ x: p.x * inv, y: p.y * inv })) as Quad);
  }

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <Modal
      open={open}
      onClose={onSkip}
      title={
        <span className="inline-flex items-center gap-1.5">
          <Crop size={17} aria-hidden="true" /> Atur Sudut Dokumen {progressLabel ? `(${progressLabel})` : ''}
        </span>
      }
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onSkip}>
            Lewati (Tanpa Crop)
          </Button>
          <Button type="button" onClick={confirm}>
            <Check size={16} aria-hidden="true" /> Gunakan Crop Ini
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {!reliable && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <ScanLine size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Deteksi otomatis kurang yakin untuk foto ini — geser 4 titik sudut di bawah supaya pas dengan tepi dokumen.
          </p>
        )}
        <div
          ref={frameRef}
          className="relative mx-auto touch-none select-none rounded-lg border border-office-border bg-slate-900/5 dark:border-slate-700"
          style={{ width: renderW, height: renderH }}
        >
          <img
            src={imageDataUrl}
            alt="Pratinjau dokumen"
            className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-fill"
            width={renderW}
            height={renderH}
            draggable={false}
          />
          <svg
            className="pointer-events-none absolute inset-0"
            width={renderW}
            height={renderH}
            viewBox={`0 0 ${renderW} ${renderH}`}
            aria-hidden="true"
          >
            <polygon points={polygonPoints} className="fill-emerald-400/20 stroke-emerald-400" strokeWidth={2} />
          </svg>
          {points.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Sudut ${HANDLE_LABELS[i]} — geser, atau pakai tombol panah`}
              onPointerDown={(e) => handlePointerDown(i, e)}
              onPointerMove={(e) => handlePointerMove(i, e)}
              onPointerUp={handlePointerUp}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{ left: p.x, top: p.y }}
              className="focus-ring absolute -ml-6 -mt-6 flex h-12 w-12 cursor-grab touch-none items-center justify-center rounded-full active:cursor-grabbing"
            >
              <span
                aria-hidden="true"
                className="h-6 w-6 rounded-full border-2 border-white bg-emerald-500/90 shadow-flat"
              />
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-office-subtext dark:text-slate-400">
          Geser titik hijau supaya persis di 4 sudut dokumen, lalu tekan "Gunakan Crop Ini". Dengan keyboard: Tab ke
          sebuah titik, lalu tombol panah (tahan Shift untuk langkah besar).
        </p>
        <p className="sr-only" aria-live="polite">
          {liveMessage}
        </p>
      </div>
    </Modal>
  );
}
