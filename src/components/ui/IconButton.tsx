import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Tone = 'default' | 'danger' | 'subtle';
type IconButtonSize = 'sm' | 'md' | 'row';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon element. Size it 16 for `sm` and `row`, 18 for `md`. */
  icon: ReactNode;
  /** REQUIRED. An icon alone carries no accessible name, so this is not
   *  optional in the type. Doubles as the tooltip via `title`. */
  label: string;
  tone?: Tone;
  size?: IconButtonSize;
  isLoading?: boolean;
}

// Hover tone only shows on the icon's own colour + background; the resting
// state stays neutral so a row of four actions doesn't read as four coloured
// buttons. `danger` is reserved for destructive actions (delete).
const tones: Record<Tone, string> = {
  default:
    'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
  danger:
    'text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400',
  subtle:
    'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700/60 dark:hover:text-slate-300',
};

// Hitbox, not padding. `sm` = 36px, the desktop floor from the audit; `md` =
// 44px, the touch floor.
//
// `row` is the size for controls that sit in a row of other controls — table
// row actions, and the clear button in a filter bar. It is responsive. The same
// `render(row)` function feeds both the desktop <td> and the mobile card, so
// the two presentations cannot pass different props — only CSS can tell them
// apart. It resolves to the 44px touch floor on phone/tablet and drops to the
// 36px compact floor from `lg` up, which is exactly where DataTable swaps its
// card list for the real table. Keeping it here means the 44/36 rule lives in
// one place instead of being re-typed at a dozen call sites.
const sizes: Record<IconButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  row: 'h-11 w-11 lg:h-9 lg:w-9',
};

/**
 * Shared icon-only action button.
 *
 * Exists because the app hand-writes `p-1.5` / `p-1` icon buttons in a dozen
 * places, each repeating its own hover-colour strings and each landing under
 * the 44px touch minimum. Deliberately NOT applied to AttachmentField in this
 * phase — its rows combine swipe-to-delete, drag-to-reorder and inline rename
 * on the same element, and changing those hitboxes belongs to Phase 2F.
 */
export function IconButton({
  icon,
  label,
  tone = 'default',
  size = 'sm',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-control transition-[background-color,color] duration-fast ease-brand focus-ring active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 size={size === 'md' ? 18 : 16} className="animate-spin" aria-hidden="true" /> : icon}
    </button>
  );
}
