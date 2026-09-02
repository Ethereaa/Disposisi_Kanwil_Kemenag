// The official Kementerian Agama emblem — ONE fixed asset.
//
// Deliberately not configurable. The mark identifies a government institution,
// so it is not something an in-app setting may swap: the custom-logo subsystem
// (a data-URL in localStorage, a global size slider in Settings, and the
// src/lib/logo.ts store behind both) was removed rather than hidden.
//
// This renders the MARK ONLY — no plate, no ring. The surface behind it belongs
// to the call site, because every context needs a different one: a white
// institutional plate on the login hero and in the sidebar brand header,
// nothing at all on the public agenda page. It used to carry its own emerald
// circle, which meant both lockups drew a plate inside a plate.
//
// Referenced by absolute URL from /public, the same way index.html's favicon and
// the public agenda page reference it. The favicon is therefore static markup
// and needs no JS.
const LOGO_SRC = '/kemenag-seeklogo.svg';

export function Logo({
  size = 32,
  /** Pass "" where adjacent text already names the institution — true in both
   *  brand lockups, where repeating it would only add noise for a screen
   *  reader. */
  alt = 'Logo Kementerian Agama Republik Indonesia',
  className = '',
}: {
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={LOGO_SRC}
      alt={alt}
      aria-hidden={alt === '' || undefined}
      // The artwork is 2000×1797, so `object-contain` in a square box
      // letterboxes instead of distorting. Height/width utilities from the
      // caller win over these attributes; the attributes stay so the box is
      // reserved before the SVG arrives.
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
