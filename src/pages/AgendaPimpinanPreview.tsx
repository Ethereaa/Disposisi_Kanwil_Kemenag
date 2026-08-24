import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { isoToDisplayWithDay } from '@/lib/date';
import { getAgendaPimpinanById } from '@/lib/db';
import type { AgendaPimpinanPublic } from '@/types';

interface Props {
  agendaId: string;
  onClose: () => void;
}

// Standalone single-agenda preview — shareable link / QR target. Fetches
// its own data (works logged-out) and has no interactive elements besides
// "Kembali" and "Bagikan": it is read-only by design, never a click-through
// into the rest of the app.
export function AgendaPimpinanPreview({ agendaId, onClose }: Props) {
  const [agenda, setAgenda] = useState<AgendaPimpinanPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getAgendaPimpinanById(agendaId)
      .then((data) => { if (mounted) setAgenda(data); })
      .catch(() => { if (mounted) setAgenda(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [agendaId]);

  if (loading) {
    return (
      <div className="app-canvas flex min-h-dvh flex-col items-center justify-center p-4 text-center">
        <p className="text-body text-slate-500 dark:text-slate-400">Memuat agenda...</p>
      </div>
    );
  }

  if (!agenda) {
    return (
      <div className="app-canvas flex min-h-dvh flex-col items-center justify-center p-4 text-center">
        <div className="glass-card w-full max-w-md p-6">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Agenda tidak ditemukan</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Tautan preview ini sudah tidak aktif atau agenda telah dihapus.</p>
          <Button className="mt-5" onClick={onClose}>Kembali</Button>
        </div>
      </div>
    );
  }

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/#/agenda-preview/${agenda.id}`
    : '';

  async function handleShare() {
    if (!shareUrl || !agenda) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Agenda Pimpinan', text: agenda.namaKegiatan, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        window.alert('Link preview berhasil disalin.');
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="app-canvas min-h-dvh p-3 text-slate-800 dark:text-slate-100 sm:p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <ArrowLeft size={16} /> Kembali
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare}>
            {typeof navigator.share === 'function' ? <Share2 size={16} /> : <Copy size={16} />} {typeof navigator.share === 'function' ? 'Bagikan' : 'Salin link'}
          </Button>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="brand-gradient-hero px-5 py-6 text-white sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100">Preview Agenda Pimpinan</p>
            <h1 className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">{agenda.namaKegiatan || 'Agenda Pimpinan'}</h1>
            <p className="mt-2 text-sm text-emerald-50/90">Tampilan ringkas untuk dibuka di ponsel atau dibagikan ke rekan kerja.</p>
          </div>

          <div className="space-y-4 p-5 sm:p-8">
            <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/70 p-4 dark:border-slate-700 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Nomor Urut</p>
                  <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">{agenda.nomorUrut}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2 text-right shadow-sm dark:bg-slate-900/60">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Tanggal</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{isoToDisplayWithDay(agenda.tanggalKegiatan) || '-'}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Waktu</p>
                <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{agenda.waktuKegiatan ? `${agenda.waktuKegiatan} WITA` : '-'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Tempat</p>
                <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{agenda.tempatKegiatan || '-'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Keterangan</p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{agenda.keterangan || '-'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Disposisi Pegawai</p>
              <p className="mt-2 text-base font-semibold text-slate-800 dark:text-slate-100">{agenda.disposisiPegawai || '-'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
