import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';

interface FieldProps {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Non-blocking heads-up (e.g. "nomor ini sudah dipakai") shown in amber, separate from a hard `error`. */
  warning?: string;
  children: ReactNode;
}

export function Field({ label, required, hint, error, warning, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && !warning && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {warning && !error && (
        <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle size={12} className="shrink-0" /> {warning}
        </p>
      )}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`input-base ${className}`} {...props} />;
  },
);

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input-base min-h-[90px] resize-y ${className}`} {...props} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ className = '', options, placeholder, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select className={`input-base appearance-none pr-9 ${className}`} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
    </div>
  );
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-emerald-200 text-emerald-600 focus:ring-emerald-400/30 dark:border-slate-600 dark:bg-slate-800"
      />
      {label}
    </label>
  );
}
