import { useSyncExternalStore } from 'react';
import KemenagLogo from '/kemenag.svg';
import { subscribeLogo, getLogoSrc } from '@/lib/logo';

export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  const src = useSyncExternalStore(subscribeLogo, getLogoSrc, () => KemenagLogo);
  return (
    <div
      className={`relative shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-600/20 overflow-hidden flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <img src={src} alt="Logo Aplikasi" width={size} height={size} className="object-contain" />
    </div>
  );
}
