import { useSyncExternalStore } from 'react';
import KemenagLogo from '/kemenag-seeklogo.svg';
import { subscribeLogo, getLogoSrc, getLogoSize } from '@/lib/logo';

export function Logo({ size, className = '' }: { size?: number; className?: string }) {
  const src = useSyncExternalStore(subscribeLogo, getLogoSrc, () => KemenagLogo);
  const configuredSize = size ?? getLogoSize();
  return (
    <div
      className={`relative shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-600/20 overflow-hidden flex items-center justify-center ${className}`}
      style={{ width: configuredSize, height: configuredSize }}
    >
      <img src={src} alt="Logo Aplikasi" width={configuredSize} height={configuredSize} className="object-contain" />
    </div>
  );
}
