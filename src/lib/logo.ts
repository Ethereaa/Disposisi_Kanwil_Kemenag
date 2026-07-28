const KEY = 'disposisi-custom-logo';
const DEFAULT_LOGO = '/kemenag.svg';
const listeners = new Set<() => void>();
let current: string | null = null;

function read(): string | null {
  return localStorage.getItem(KEY);
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
  if (current) updateFavicon(current);
}

export function getLogoSrc(): string {
  return current ?? DEFAULT_LOGO;
}

export function hasCustomLogoSnapshot(): boolean {
  return current !== null;
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
