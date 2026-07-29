const KEY = 'disposisi-custom-logo';
const SIZE_KEY = 'disposisi-logo-size';
const DEFAULT_LOGO = '/kemenag-seeklogo.svg';
const DEFAULT_SIZE = 40;
const listeners = new Set<() => void>();
let current: string | null = null;
let size = DEFAULT_SIZE;

function read(): string | null {
  return localStorage.getItem(KEY);
}

function readSize(): number {
  const raw = localStorage.getItem(SIZE_KEY);
  if (!raw) return DEFAULT_SIZE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(24, Math.min(220, parsed)) : DEFAULT_SIZE;
}

function emit() {
  listeners.forEach((l) => l());
}

function updateFavicon(src: string) {
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (link) link.href = src;
}

export function initLogo(): void {
  current = read();
  size = readSize();
  if (current) updateFavicon(current);
}

export function getLogoSrc(): string {
  return current ?? DEFAULT_LOGO;
}

export function hasCustomLogoSnapshot(): boolean {
  return current !== null;
}

export function getLogoSize(): number {
  return size;
}

export function setLogoSize(next: number): void {
  const normalized = Math.max(24, Math.min(220, next));
  localStorage.setItem(SIZE_KEY, String(normalized));
  size = normalized;
  emit();
}

export function setCustomLogo(dataUrl: string): void {
  localStorage.setItem(KEY, dataUrl);
  current = dataUrl;
  updateFavicon(dataUrl);
  emit();
}

export function clearCustomLogo(): void {
  localStorage.removeItem(KEY);
  current = null;
  updateFavicon(DEFAULT_LOGO);
  emit();
}

export function subscribeLogo(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
