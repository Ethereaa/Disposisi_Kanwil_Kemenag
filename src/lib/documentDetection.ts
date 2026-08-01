// Auto-crop + perspective-correct for documents photographed with a phone
// camera. Pure canvas/pixel math — no OpenCV.js or ML dependency, per the
// request to try this approach first.
//
// Strategy for corner detection: the brief for this feature is literally
// "kontras dokumen putih vs latar meja/background gelap" (white document vs
// darker desk/background), so rather than a generic Hough-line search we
// lean on that contrast directly — threshold the image into "paper" vs
// "background", take the largest bright blob, and pick its 4 extreme
// corners. This is the same trick classic "4-point transform" scanners use
// and holds up reasonably for a roughly-convex document on a plainer
// background, but — like every corner detector, canvas-based or not — it
// is NOT reliable for low-contrast backgrounds (white desk, cluttered
// table, another sheet of paper underneath). That's exactly why every
// caller of detectDocumentCorners() must show the result for manual
// confirmation/adjustment rather than applying it silently — see
// CornerAdjustModal.tsx.

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point]; // top-left, top-right, bottom-right, bottom-left

export interface DetectionResult {
  corners: Quad;
  /** false when the bright-blob heuristic didn't find a confident quad —
   *  corners fall back to a small inset of the full frame so the manual
   *  correction UI still has sensible starting handles. */
  reliable: boolean;
}

function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

// Simple Otsu threshold on a grayscale histogram — separates the image into
// two clusters (paper vs. background) without a hand-picked cutoff.
function otsuThreshold(gray: Float32Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

// Iterative (stack-based, not recursive) flood fill to label the largest
// connected "bright" component. Working resolution is capped small (see
// detectDocumentCorners) so this stays fast even as a plain JS loop.
function largestBrightComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(mask.length);
  let bestComponent: number[] | null = null;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    const component: number[] = [];
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const idx = stack.pop() as number;
      component.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbors =
        x > 0 && x < width - 1 && y > 0 && y < height - 1
          ? [idx - 1, idx + 1, idx - width, idx + width]
          : [x > 0 ? idx - 1 : -1, x < width - 1 ? idx + 1 : -1, y > 0 ? idx - width : -1, y < height - 1 ? idx + width : -1];
      for (const n of neighbors) {
        if (n >= 0 && n < mask.length && mask[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    if (!bestComponent || component.length > bestComponent.length) bestComponent = component;
  }
  const out = new Uint8Array(mask.length);
  if (bestComponent) for (const idx of bestComponent) out[idx] = 1;
  return out;
}

/**
 * Detects the 4 corners of a document within a photo. `source` should
 * already be drawn to a canvas at (or close to) the photo's natural size;
 * this function does its own cheap downscale internally for speed.
 */
export function detectDocumentCorners(source: HTMLCanvasElement): DetectionResult {
  const fullW = source.width;
  const fullH = source.height;

  // Downscale for the detection pass — corner *positions* are then scaled
  // back up, so accuracy barely suffers but the pixel loops stay fast.
  const workMax = 480;
  const scale = Math.min(1, workMax / Math.max(fullW, fullH));
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d');
  const insetFallback = (): DetectionResult => {
    const inset = Math.round(Math.min(fullW, fullH) * 0.06);
    return {
      reliable: false,
      corners: [
        { x: inset, y: inset },
        { x: fullW - inset, y: inset },
        { x: fullW - inset, y: fullH - inset },
        { x: inset, y: fullH - inset },
      ],
    };
  };
  if (!ctx) return insetFallback();
  ctx.drawImage(source, 0, 0, w, h);

  const gray = toGrayscale(ctx.getImageData(0, 0, w, h));
  const threshold = otsuThreshold(gray);

  // Paper is assumed brighter than its background. If Otsu's split is too
  // extreme (near-uniform image, or background actually brighter), bail
  // out to the fallback rather than trust a meaningless mask.
  const mask = new Uint8Array(w * h);
  let brightCount = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] >= threshold) {
      mask[i] = 1;
      brightCount++;
    }
  }
  const brightRatio = brightCount / mask.length;
  if (brightRatio < 0.08 || brightRatio > 0.96) return insetFallback();

  const largest = largestBrightComponent(mask, w, h);
  let compCount = 0;
  for (let i = 0; i < largest.length; i++) compCount += largest[i];
  const compRatio = compCount / largest.length;
  if (compRatio < 0.08) return insetFallback();

  // Classic 4-point extremes: for each pixel in the component, track the
  // ones that minimize/maximize (x+y) and (x-y) — these are the corners of
  // the smallest quadrilateral enclosing a roughly-convex blob.
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let topLeft: Point = { x: 0, y: 0 };
  let bottomRight: Point = { x: w, y: h };
  let topRight: Point = { x: w, y: 0 };
  let bottomLeft: Point = { x: 0, y: h };
  for (let idx = 0; idx < largest.length; idx++) {
    if (!largest[idx]) continue;
    const x = idx % w;
    const y = (idx / w) | 0;
    const sum = x + y;
    const diff = x - y;
    if (sum < minSum) { minSum = sum; topLeft = { x, y }; }
    if (sum > maxSum) { maxSum = sum; bottomRight = { x, y }; }
    if (diff > maxDiff) { maxDiff = diff; topRight = { x, y }; }
    if (diff < minDiff) { minDiff = diff; bottomLeft = { x, y }; }
  }

  // Sanity check: a degenerate quad (near-zero area) means the extremes
  // heuristic didn't actually find a document shape — fall back.
  const area = Math.abs(
    (topRight.x - topLeft.x) * (bottomLeft.y - topLeft.y) - (bottomLeft.x - topLeft.x) * (topRight.y - topLeft.y),
  );
  if (area < (w * h) * 0.03) return insetFallback();

  const inv = 1 / scale;
  const toFull = (p: Point): Point => ({ x: p.x * inv, y: p.y * inv });
  return {
    reliable: true,
    corners: [toFull(topLeft), toFull(topRight), toFull(bottomRight), toFull(bottomLeft)],
  };
}

// --- Perspective warp -------------------------------------------------

type Mat3 = [number, number, number, number, number, number, number, number, number];

function solve8x8(A: number[][], b: number[]): number[] {
  const n = 8;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col] || 1e-12;
    for (let c = col; c <= n; c++) m[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      if (!factor) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

// Computes the homography H (3x3, h33=1) mapping each src[i] -> dst[i].
function computeHomography(src: Quad, dst: Quad): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }
  const h = solve8x8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function applyH(H: Mat3, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Crops and perspective-corrects `source` to the quadrilateral `corners`
 * (top-left, top-right, bottom-right, bottom-left order), returning a new
 * canvas sized to the quad's own (straightened) proportions, capped at
 * `maxDim` on the long edge.
 */
export function warpPerspective(source: CanvasImageSource, corners: Quad, maxDim = 1600): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners;
  const outWRaw = Math.max(dist(tl, tr), dist(bl, br));
  const outHRaw = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxDim / Math.max(outWRaw, outHRaw));
  const outW = Math.max(1, Math.round(outWRaw * scale));
  const outH = Math.max(1, Math.round(outHRaw * scale));

  // Map OUTPUT coordinates back to SOURCE coordinates (inverse mapping) so
  // every destination pixel is filled with no holes.
  const dstRect: Quad = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const H = computeHomography(dstRect, corners);

  // Read the whole source once into an ImageData for bilinear sampling.
  const srcCanvas = document.createElement('canvas');
  const srcW = (source as HTMLCanvasElement).width ?? (source as HTMLImageElement).naturalWidth;
  const srcH = (source as HTMLCanvasElement).height ?? (source as HTMLImageElement).naturalHeight;
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  if (!srcCtx || !outCtx) return out;
  srcCtx.drawImage(source, 0, 0, srcW, srcH);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const outData = outCtx.createImageData(outW, outH);

  const sample = (x: number, y: number, channel: number): number => {
    const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(y)));
    const x1 = Math.min(srcW - 1, x0 + 1);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const i00 = (y0 * srcW + x0) * 4 + channel;
    const i10 = (y0 * srcW + x1) * 4 + channel;
    const i01 = (y1 * srcW + x0) * 4 + channel;
    const i11 = (y1 * srcW + x1) * 4 + channel;
    const top = srcData[i00] * (1 - fx) + srcData[i10] * fx;
    const bottom = srcData[i01] * (1 - fx) + srcData[i11] * fx;
    return top * (1 - fy) + bottom * fy;
  };

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = applyH(H, x, y);
      const o = (y * outW + x) * 4;
      if (p.x < -1 || p.x > srcW || p.y < -1 || p.y > srcH) {
        outData.data[o + 3] = 0;
        continue;
      }
      outData.data[o] = sample(p.x, p.y, 0);
      outData.data[o + 1] = sample(p.x, p.y, 1);
      outData.data[o + 2] = sample(p.x, p.y, 2);
      outData.data[o + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}
