import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import { ChevronDown, AlertTriangle, AlertCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// FIELD WIRING
//
// A `<Field>` owns the ids for its label, hint, warning and error; the control
// it wraps picks them up from context. That is why no call site has to thread
// `id` / `aria-describedby` / `aria-invalid` by hand — previously the label was
// a bare `<label>` with no `htmlFor`, so tapping a label did nothing and a
// screen reader read the input unlabelled.
//
// Note: `aria-required` only, never the native `required` attribute — adding
// native validation here would change WHICH submissions the browser blocks.
// Required-ness stays entirely in each form's own validate().
// ─────────────────────────────────────────────────────────────────────────────

interface FieldWiring {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

type WiredAria = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: InputHTMLAttributes<HTMLInputElement>['aria-invalid'];
  'aria-required'?: InputHTMLAttributes<HTMLInputElement>['aria-required'];
};

/** Explicit props always win over the surrounding Field's wiring. */
function wiredAria(f: FieldWiring | null, props: WiredAria): WiredAria {
  return {
    id: props.id ?? f?.controlId,
    'aria-describedby': props['aria-describedby'] ?? f?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (f?.invalid ? true : undefined),
    'aria-required': props['aria-required'] ?? (f?.required ? true : undefined),
  };
}

// Error state on the control itself, so "this one is wrong" is carried by the
// border too and not by the message colour alone.
const invalidRing =
  'border-rose-400 focus:border-rose-500 focus:ring-rose-500/25 dark:border-rose-500/70 dark:focus:border-rose-400 dark:focus:ring-rose-500/25';

// 44px on touch, back to the compact desktop height from `sm:` up.
const controlHeight = 'min-h-11 sm:min-h-10';

const labelClass = 'text-sm font-semibold text-slate-700 dark:text-slate-200';

interface FieldProps {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Non-blocking heads-up (e.g. "nomor ini sudah dipakai") shown in amber, separate from a hard `error`. */
  warning?: string;
  /** Set when the field wraps something other than one labellable control
   *  (e.g. the lampiran picker). Renders group semantics instead of a
   *  `<label for>` pointing at an id that never appears in the DOM. */
  asGroup?: boolean;
  children: ReactNode;
}

export function Field({ label, required, hint, error, warning, asGroup, children }: FieldProps) {
  const base = useId();
  const controlId = `${base}c`;
  const labelId = `${base}l`;
  const hintId = `${base}h`;
  const warningId = `${base}w`;
  const errorId = `${base}e`;

  // Same precedence as before: a hard error hides the hint and the warning.
  const showHint = !!hint && !error && !warning;
  const showWarning = !!warning && !error;
  const describedBy =
    [showHint && hintId, showWarning && warningId, !!error && errorId].filter(Boolean).join(' ') || undefined;

  const labelBody = (
    <>
      {label}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-rose-500">
          *
        </span>
      )}
    </>
  );

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: !!error, required: !!required }}>
      <div
        className="flex flex-col gap-1.5"
        role={asGroup ? 'group' : undefined}
        aria-labelledby={asGroup && label ? labelId : undefined}
      >
        {label &&
          (asGroup ? (
            <span id={labelId} className={labelClass}>
              {labelBody}
            </span>
          ) : (
            <label id={labelId} htmlFor={controlId} className={labelClass}>
              {labelBody}
            </label>
          ))}
        {children}
        {showHint && (
          <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        )}
        {showWarning && (
          <p
            id={warningId}
            className="flex items-start gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {warning}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1 text-xs font-medium text-rose-600 dark:text-rose-400"
          >
            <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    const field = useContext(FieldContext);
    return (
      <input
        ref={ref}
        {...props}
        {...wiredAria(field, props)}
        className={`input-base ${controlHeight} ${field?.invalid ? invalidRing : ''} ${className}`}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    const field = useContext(FieldContext);
    return (
      <textarea
        ref={ref}
        {...props}
        {...wiredAria(field, props)}
        className={`input-base min-h-[90px] resize-y ${field?.invalid ? invalidRing : ''} ${className}`}
      />
    );
  },
);

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className = '', options, placeholder, ...props }, ref) {
    const field = useContext(FieldContext);
    return (
      <div className="relative">
        <select
          ref={ref}
          {...props}
          {...wiredAria(field, props)}
          className={`input-base ${controlHeight} appearance-none pr-9 ${field?.invalid ? invalidRing : ''} ${className}`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
        />
      </div>
    );
  },
);

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    // The whole row is the target, and it clears 44px on touch — a 16px box
    // was the smallest tap target in the app.
    <label className="inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-sm text-slate-700 sm:min-h-0 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-emerald-200 text-emerald-600 focus:ring-emerald-400/30 sm:h-4 sm:w-4 dark:border-slate-600 dark:bg-slate-800"
      />
      {label}
    </label>
  );
}

/** A labelled band of related fields. Gives a long form readable structure
 *  instead of one undifferentiated 8-field grid. */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-office-border pb-2 dark:border-slate-700">
        <h3 className="text-label uppercase text-office-subtext dark:text-slate-400">{title}</h3>
        {hint && <p className="text-xs text-office-subtext/80 dark:text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Collected required-field messages, shown at the top of a form after a
 *  failed submit — the per-field message can be scrolled out of sight in a
 *  modal, so the summary is what tells you why nothing saved. */
export function FormErrorSummary({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-control border border-rose-200 bg-rose-50 px-3.5 py-3 dark:border-rose-500/40 dark:bg-rose-500/10"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
      <div className="space-y-1 text-xs text-rose-700 dark:text-rose-300">
        <p className="text-sm font-semibold">Data belum lengkap</p>
        <ul className="list-inside list-disc space-y-0.5">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
