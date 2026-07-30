import type { LucideIcon } from 'lucide-react';
import { Inbox, Plus } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-400">
        <Icon size={28} strokeWidth={1.75} />
      </div>
      <p className="text-sm font-semibold text-office-text dark:text-slate-200">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-office-subtext dark:text-slate-400">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="mt-4">
          <Plus size={16} /> {actionLabel}
        </Button>
      )}
    </div>
  );
}
