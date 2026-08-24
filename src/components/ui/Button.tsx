import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks interaction. Kept separate from `disabled`
   *  so a busy button still reads as "working", not "unavailable". */
  isLoading?: boolean;
  children: ReactNode;
}

// Hierarchy, most to least emphatic:
//   primary   — the one main action on a surface
//   danger    — destructive confirmation
//   outline   — secondary action, still clearly a button
//   secondary — tertiary / paired action
//   ghost     — low-emphasis, inline (e.g. "Lihat semua")
const variants: Record<Variant, string> = {
  primary: 'brand-solid text-white shadow-flat',
  secondary:
    'border border-office-border bg-white text-slate-700 shadow-flat hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  danger: 'bg-rose-600 text-white shadow-flat hover:bg-rose-700',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
  outline:
    'border border-office-border bg-white text-slate-700 hover:border-office-borderStrong hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
};

// One radius across all three sizes — previously `sm` used rounded-xl while
// md/lg used rounded-2xl, so two adjacent buttons of different sizes read as
// two different components. Heights are held at >=36px so even `sm` clears
// the desktop icon-target floor.
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-body gap-1.5',
  md: 'min-h-10 px-4 py-2 text-body gap-2',
  lg: 'min-h-11 px-5 py-2.5 text-base gap-2',
};

const spinnerSize: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-control font-medium transition-[background-color,border-color,box-shadow,transform] duration-fast ease-brand focus-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Loader2 size={spinnerSize[size]} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
