import { Paperclip } from 'lucide-react';
import type { Attachment } from '@/types';

/**
 * Compact "Lampiran" table cell: a small thumbnail (from the first
 * attachment that has one, i.e. a photo-derived document) plus a badge
 * showing the total file count. Shared by the Surat Masuk, Surat Keluar,
 * and Agenda Pimpinan tables so a staff member can spot at a glance which
 * rows are actually scanned photos vs. a plain PDF upload.
 */
export function LampiranCell({ lampiran }: { lampiran: Attachment[] | undefined }) {
  if (!lampiran?.length) {
    return <span className="text-xs text-office-subtext dark:text-slate-500">-</span>;
  }
  const thumbnail = lampiran.find((a) => a.thumbnail)?.thumbnail;
  return (
    <div className="flex items-center gap-1.5">
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="h-7 w-7 shrink-0 rounded-md border border-office-border object-cover dark:border-slate-600"
        />
      )}
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        <Paperclip size={12} /> {lampiran.length}
      </span>
    </div>
  );
}
