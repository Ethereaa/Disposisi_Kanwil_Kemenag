import { useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATED-CONTROL REGISTRY
//
// Every form in this app validates by hand and then wants to put the cursor on
// the first field that needs attention. All three were doing that with their
// own `useRef<Record<string, HTMLElement | null>>` plus an inline
// `ref={(el) => { refs.current.foo = el; }}` per control — a fresh closure on
// every render, so React detached and re-attached each registered ref on every
// keystroke. One hook instead, with a stable callback per key.
//
// Pairs with `FormErrorSummary`: `focusField` is what makes a summary line
// clickable, so the message can also be the way back to the control.
// ─────────────────────────────────────────────────────────────────────────────

export function useFieldRefs() {
  const els = useRef<Record<string, HTMLElement | null>>({});
  const callbacks = useRef<Record<string, (el: HTMLElement | null) => void>>({});

  /** `<Input ref={register('tanggalSurat')} />` */
  const register = useCallback((key: string) => {
    let cb = callbacks.current[key];
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        els.current[key] = el;
      };
      callbacks.current[key] = cb;
    }
    return cb;
  }, []);

  /** Scrolls the control into view and focuses it. No-op for a key whose
   *  control isn't currently mounted (e.g. Sub Disposisi while the tujuan
   *  isn't Kabag TU), so a stale error key can't throw. */
  const focusField = useCallback((key: string) => {
    const el = els.current[key];
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    // scrollIntoView has already placed it; letting focus() scroll as well
    // makes it fight the modal's own scroll container.
    el.focus({ preventScroll: true });
  }, []);

  return { register, focusField };
}
