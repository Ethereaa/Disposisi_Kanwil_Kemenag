import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
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

/**
 * Lets the user verify/adjust the 4 detected document corners on a photo
 * before it's cropped + perspective-corrected — auto-detection on a phone
 * photo is rarely 100% accurate, so this confirmation step is not optional.
 * Uses Pointer Events (not the touch handlers elsewhere in this codebase)
 * since corner-dragging needs to work with both mouse and touch input.
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

  // Re-derive the starting points whenever a new photo (new `corners`) is
  // handed to this modal instance — cheap key-based reset instead of a
  // useEffect, since the parent always mounts one modal per queue item.
  const [lastCornersRef] = useState({ current: corners });
  if (lastCornersRef.current !== corners) {
    lastCornersRef.current = corners;
    setPoints(corners.map((p) => ({ x: p.x * ratio, y: p.y * ratio })) as Quad);
  }

  function clamp(p: Point): Point {
    return { x: Math.max(0, Math.min(renderW, p.x)), y: Math.max(0, Math.min(renderH, p.y)) };
  }

  function handlePointerDown(index: number, e: ReactPointerEvent<SVGCircleElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(index);
  }
  function handlePointerMove(index: number, e: ReactPointerEvent<SVGCircleElement>) {
    if (dragIndex !== index) return;
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const next = clamp({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setPoints((prev) => {
      const copy = [...prev] as Quad;
      copy[index] = next;
      return copy;
    });
  }
  function handlePointerUp(e: ReactPointerEvent<SVGCircleElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragIndex(null);
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
          <Crop size={17} /> Atur Sudut Dokumen {progressLabel ? `(${progressLabel})` : ''}
        </span>
      }
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onSkip}>
            Lewati (Tanpa Crop)
          </Button>
          <Button type="button" onClick={confirm}>
            <Check size={16} /> Gunakan Crop Ini
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {!reliable && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <ScanLine size={14} className="mt-0.5 shrink-0" />
            Deteksi otomatis kurang yakin untuk foto ini — geser 4 titik sudut di bawah supaya pas dengan tepi dokumen.
          </p>
        )}
        <div
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
            className="absolute inset-0 touch-none"
            width={renderW}
            height={renderH}
            viewBox={`0 0 ${renderW} ${renderH}`}
          >
            <polygon points={polygonPoints} className="fill-emerald-400/20 stroke-emerald-400" strokeWidth={2} />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={12}
                className="cursor-grab fill-emerald-500/90 stroke-white active:cursor-grabbing"
                strokeWidth={2}
                onPointerDown={(e) => handlePointerDown(i, e)}
                onPointerMove={(e) => handlePointerMove(i, e)}
                onPointerUp={handlePointerUp}
              >
                <title>{HANDLE_LABELS[i]}</title>
              </circle>
            ))}
          </svg>
        </div>
        <p className="text-center text-xs text-office-subtext dark:text-slate-400">
          Geser titik hijau supaya persis di 4 sudut dokumen, lalu tekan "Gunakan Crop Ini".
        </p>
      </div>
    </Modal>
  );
}
