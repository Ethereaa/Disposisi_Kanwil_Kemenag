import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SELECTION CARD GROUP
//
// A set of mutually exclusive choices rendered as tiles.
//
// Lifted out of ExportPage, where the markup already claimed `role="radiogroup"`
// / `role="radio"` / `aria-checked` but shipped none of the keyboard behaviour
// those roles promise: every tile was its own tab stop and the arrow keys did
// nothing, so a screen reader announced "radio, 1 of 5" and then the documented
// interaction failed.
//
// Only the GROUP is exported. The tile stays internal on purpose — that makes it
// impossible to assemble a radiogroup in this codebase without the keyboard
// support, which is exactly the bug this replaces.
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectionCardOption<T extends string> {
  key: T;
  label: string;
  /** Secondary line under the label. */
  desc?: string;
  icon?: LucideIcon;
  /** Skipped by arrow/Home/End navigation and never receives the tab stop. */
  disabled?: boolean;
}

interface SelectionCardGroupProps<T extends string> {
  /** Accessible name for the group, e.g. "Format berkas". */
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: SelectionCardOption<T>[];
  /** Tiles per row from `sm:` up. One column at every width below that. */
  columns?: 1 | 2;
  className?: string;
}

const tileBase =
  'focus-ring flex min-h-[3.5rem] items-center gap-3 rounded-control border p-3 text-left transition-[background-color,border-color,box-shadow] duration-fast ease-brand';
const tileActive =
  'border-office-primary bg-emerald-50 ring-1 ring-office-primary dark:border-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-400';
const tileIdle =
  'border-office-border bg-white dark:border-slate-700 dark:bg-slate-800';
// Hover only where a press would actually do something.
const tileIdleHover = 'hover:border-office-borderStrong hover:bg-slate-50 dark:hover:border-slate-600';

export function SelectionCardGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 2,
  className = '',
}: SelectionCardGroupProps<T>) {
  const tileRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const selectable = options.filter((o) => !o.disabled);

  // One tab stop for the whole group (ARIA radiogroup pattern): the checked
  // tile owns it, falling back to the first selectable tile when the current
  // value matches nothing selectable.
  const tabStopKey = selectable.find((o) => o.key === value)?.key ?? selectable[0]?.key;

  function select(key: T) {
    onChange(key);
    // Focus follows selection — in a radiogroup the two move together.
    tileRefs.current[key]?.focus();
  }

  function move(from: T, delta: 1 | -1) {
    if (selectable.length === 0) return;
    const i = selectable.findIndex((o) => o.key === from);
    // A disabled current value has no seat in the ring, so enter from the edge
    // the keypress came from rather than jumping to an arbitrary index.
    const next =
      i === -1
        ? selectable[delta === 1 ? 0 : selectable.length - 1]
        : selectable[(i + delta + selectable.length) % selectable.length];
    if (next) select(next.key);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>, key: T) {
    switch (e.key) {
      // Both axes move the selection: the tiles are a grid below `sm:` and a
      // single column above it, so neither axis is the "wrong" one.
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(key, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(key, -1);
        break;
      case 'Home':
        e.preventDefault();
        if (selectable[0]) select(selectable[0].key);
        break;
      case 'End':
        e.preventDefault();
        if (selectable.length > 0) select(selectable[selectable.length - 1].key);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid gap-2.5 ${columns === 2 ? 'sm:grid-cols-2' : ''} ${className}`}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            ref={(el) => {
              tileRefs.current[opt.key] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            tabIndex={opt.key === tabStopKey ? 0 : -1}
            onClick={() => select(opt.key)}
            onKeyDown={(e) => handleKeyDown(e, opt.key)}
            className={`${tileBase} ${active ? tileActive : tileIdle} ${
              opt.disabled ? 'cursor-not-allowed opacity-50' : !active ? tileIdleHover : ''
            }`}
          >
            {Icon && (
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-chip ${
                  active ? 'brand-solid text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                <Icon size={17} aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-body-strong ${
                  active ? 'text-emerald-800 dark:text-emerald-200' : 'text-office-text dark:text-slate-100'
                }`}
              >
                {opt.label}
              </span>
              {opt.desc && (
                <span className="block truncate text-xs text-office-subtext dark:text-slate-400">{opt.desc}</span>
              )}
            </span>
            {active && (
              <Check size={16} className="shrink-0 text-office-primary dark:text-emerald-400" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
