import { useMemo, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, ExternalLink, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { isoToDisplayWithDay, formatDateTime } from '@/lib/date';
import { deleteAgendaPimpinan, resequenceAgendaPimpinan } from '@/lib/db';
import { getErrorMessage } from '@/lib/error';
import type { AgendaPimpinan } from '@/types';
import { AgendaPimpinanForm } from './AgendaPimpinanForm';
import { AgendaStatusBadge, DateProximityBadge } from '@/components/ui/StatusBadge';

interface Props {
  rows: AgendaPimpinan[];
  onRefresh: () => void;
  canDelete?: boolean;
}

type View = 'list' | 'form' | 'detail';

export function AgendaPimpinanPage({ rows, onRefresh, canDelete = true }: Props) {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<AgendaPimpinan | null>(null);
  const [detail, setDetail] = useState<AgendaPimpinan | null>(null);
  const [toDelete, setToDelete] = useState<AgendaPimpinan | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Optimistic UI: hide the row immediately on delete confirm instead of
  // waiting for the full refetch, then reconcile once refresh() resolves.
  const visibleRows = useMemo(() => rows.filter((r) => !removedIds.has(r.id)), [rows, removedIds]);

  const columns: Column<AgendaPimpinan>[] = [
    {
      key: 'nomorUrut',
      header: 'No.',
      sortable: true,
      sortValue: (r) => r.nomorUrut,
      width: '60px',
      render: (r) => <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{r.nomorUrut}</span>,
    },
    {
      key: 'tanggalKegiatan',
      header: 'Tanggal',
      sortable: true,
      sortValue: (r) => r.tanggalKegiatan ?? '',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          {isoToDisplayWithDay(r.tanggalKegiatan) || '-'}
          <DateProximityBadge iso={r.tanggalKegiatan} />
        </span>
      ),
    },
    {
      key: 'waktuKegiatan',
      header: 'Waktu',
      sortable: true,
      sortValue: (r) => r.waktuKegiatan,
      render: (r) => <span className="font-medium">{r.waktuKegiatan ? `${r.waktuKegiatan} WITA` : '-'}</span>,
    },
    {
      key: 'namaKegiatan',
      header: 'Nama Kegiatan',
      sortable: true,
      sortValue: (r) => r.namaKegiatan,
      render: (r) => <span className="max-w-[240px] truncate inline-block">{r.namaKegiatan || '-'}</span>,
    },
    {
      key: 'tempatKegiatan',
      header: 'Tempat',
      sortable: true,
      sortValue: (r) => r.tempatKegiatan,
      render: (r) => <span className="max-w-[220px] truncate inline-block">{r.tempatKegiatan || '-'}</span>,
    },
    {
      key: 'keterangan',
      header: 'Keterangan',
      sortable: true,
      sortValue: (r) => r.keterangan,
      render: (r) => <AgendaStatusBadge value={r.keterangan} />,
    },
    {
      key: 'disposisiPegawai',
      header: 'Disposisi Pegawai',
      sortable: true,
      sortValue: (r) => r.disposisiPegawai,
      render: (r) => <span className="max-w-[220px] truncate inline-block">{r.disposisiPegawai || '-'}</span>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      width: '110px',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); window.location.hash = `#/agenda-preview/${r.id}`; }} className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-900/40" title="Buka Preview">
            <ExternalLink size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDetail(r); }} className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-900/40" title="Lihat">
            <Eye size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(r); setView('form'); }} className="rounded-md p-1.5 text-slate-500 hover:bg-amber-100 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-amber-900/40" title="Edit">
            <Pencil size={16} />
          </button>
          {canDelete && (
            <button onClick={(e) => { e.stopPropagation(); setToDelete(r); }} className="rounded-md p-1.5 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/40" title="Hapus">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  async function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(null);
    // Optimistic: hide immediately, roll back if the delete actually fails.
    setRemovedIds((prev) => new Set(prev).add(id));
    try {
      await deleteAgendaPimpinan(id);
      await resequenceAgendaPimpinan();
      toast('Agenda berhasil dihapus.', 'success');
      onRefresh();
    } catch (err) {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast(getErrorMessage(err, 'Gagal menghapus agenda.'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-emerald-100/80 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/70">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Agenda Pimpinan</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{rows.length} agenda tercatat</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.open('/#/agenda-preview-home', '_self')}>
            <ExternalLink size={16} /> Buka Preview Agenda
          </Button>
          <Button onClick={() => { setEditing(null); setView('form'); }}>
            <Plus size={16} /> Tambah Agenda
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={visibleRows}
        searchKeys={['namaKegiatan', 'tempatKegiatan', 'keterangan', 'disposisiPegawai']}
        searchPlaceholder="Cari agenda pimpinan..."
        emptyMessage="Belum ada agenda pimpinan."
        emptyIcon={CalendarCheck}
        emptyActionLabel="Tambah Agenda"
        onEmptyAction={() => { setEditing(null); setView('form'); }}
        initialSort={{ key: 'nomorUrut', dir: 'asc' }}
        pageSize={10}
        onRowClick={(r) => setDetail(r)}
      />

      <Modal
        open={view === 'form'}
        onClose={() => { setView('list'); setEditing(null); }}
        title={editing ? 'Edit Agenda Pimpinan' : 'Tambah Agenda Pimpinan'}
        size="lg"
      >
        <AgendaPimpinanForm
          editing={editing}
          onSaved={() => { setView('list'); setEditing(null); onRefresh(); }}
          onCancel={() => { setView('list'); setEditing(null); }}
        />
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail Agenda Pimpinan"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button>
            <Button onClick={() => { if (detail) { setEditing(detail); setView('form'); setDetail(null); } }}>
              <Pencil size={16} /> Edit
            </Button>
          </>
        }
      >
        {detail && <DetailContent agenda={detail} />}
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus Agenda Pimpinan"
        message={`Yakin ingin menghapus agenda no. ${toDelete?.nomorUrut} (${toDelete?.namaKegiatan || 'tanpa nama kegiatan'})?`}
      />
    </div>
  );
}

function DetailContent({ agenda }: { agenda: AgendaPimpinan }) {
  const items = [
    { label: 'Nomor Urut', value: String(agenda.nomorUrut) },
    { label: 'Tanggal Kegiatan', value: isoToDisplayWithDay(agenda.tanggalKegiatan) || '-' },
    { label: 'Waktu Kegiatan', value: agenda.waktuKegiatan ? `${agenda.waktuKegiatan} WITA` : '-' },
    { label: 'Nama Kegiatan', value: agenda.namaKegiatan || '-' },
    { label: 'Tempat Kegiatan', value: agenda.tempatKegiatan || '-' },
    { label: 'Keterangan', value: agenda.keterangan || '-' },
    { label: 'Disposisi Pegawai', value: agenda.disposisiPegawai || '-' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="border-b border-slate-200 pb-2 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.value}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Dibuat: {formatDateTime(agenda.createdAt)} · Diperbarui: {formatDateTime(agenda.updatedAt)}
      </p>
    </div>
  );
}
