import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  /** The page's own title. This is the app's single <h1>. */
  title: string;
  /** Subtitle, record count or status metadata. ReactNode so a page can inline
   *  its own emphasis (e.g. an overdue warning) without a second prop. */
  description?: ReactNode;
  /** The icon the sidebar already uses for this destination, repeated here so
   *  the nav item and the page it opens read as the same thing. */
  icon?: LucideIcon;
  /** Page-level actions. A single slot, not primary/secondary props: the caller
   *  composes and orders its own <Button>s, which is what Agenda Pimpinan needs
   *  (outline "Buka Preview Agenda" before primary "Tambah Agenda"). */
  actions?: ReactNode;
}

/**
 * The page's header band, shared by every authenticated page.
 *
 * Exists because six pages hand-rolled the same block — a `.soft-panel` with an
 * `<h2>`, a count or description line, and zero-to-two buttons — and three of
 * them printed a title the top bar was already printing one line above.
 *
 * The Phase 2C split: the sticky Header is app context (where you are, theme),
 * this is page context (what this page is, what you can do on it). Actions live
 * here and only here.
 *
 * Not a card. It sits directly on the canvas with a rule under it, so a page
 * does not open with a panel wrapping a panel wrapping the real content.
 */
export function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-office-border pb-4 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-office-primary/10 text-office-primary dark:bg-emerald-500/10 dark:text-emerald-400">
            <Icon size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-title text-office-text dark:text-slate-100">{title}</h1>
          {description && (
            <p className="mt-0.5 text-body text-office-subtext dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>
      {/* Actions stack full-width below 640px. As a wrapping row they were
          left-aligned at their natural widths, so Agenda Pimpinan's pair
          ("Buka Preview Agenda" + "Tambah Agenda" ≈ 340px) overflowed the
          328px of usable width at 360 and broke to a second line ragged. One
          button per row reads as a deliberate mobile action stack; from `sm:`
          up the original right-aligned row is unchanged. */}
      {actions && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
          {actions}
        </div>
      )}
    </div>
  );
}
