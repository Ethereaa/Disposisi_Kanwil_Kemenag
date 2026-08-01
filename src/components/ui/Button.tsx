import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'brand-solid text-white shadow-sm focus:ring-emerald-500/30',
  secondary: 'border border-emerald-100 bg-white/80 text-slate-700 shadow-sm hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-700 focus:ring-emerald-400/20',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus:ring-rose-500/30',
  ghost: 'text-slate-700 hover:bg-emerald-50 dark:text-slate-200 dark:hover:bg-slate-800 focus:ring-emerald-400/20',
  outline: 'border border-emerald-200 bg-white/70 text-slate-700 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700 focus:ring-emerald-400/20',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5 rounded-xl',
  md: 'px-4 py-2 text-sm gap-2 rounded-2xl',
  lg: 'px-5 py-2.5 text-base gap-2 rounded-2xl',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 active:scale-[0.98] ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
