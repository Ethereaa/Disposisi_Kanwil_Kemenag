import { useMemo, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { isoToDisplay, formatDateTime } from '@/lib/date';
import { deleteAgendaPimpinan, resequenceAgendaPimpinan } from '@/lib/db';
import type { AgendaPimpinan } from '@/types';
import { AgendaPimpinanForm } from './AgendaPimpinanForm';

interface Props {
  rows: AgendaPimpinan[];
  onRefresh: () => void;
}

type View = 'list' | 'form' | 'detail';

export function AgendaPimpinanPage({ rows, onRefresh }: Props) {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<AgendaPimpinan | null>(null);
  const [detail, setDetail] = useState<AgendaPimpinan | null>(null);
  const [toDelete, setToDelete] = useState<AgendaPimpinan | null>(null);
  const { toast } = useToast();

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
      render: (r) => <span className="font-medium">{isoToDisplay(r.tanggalKegiatan) || '-'}</span>,
    },
    {
      key: 'waktuKegiatan',
      header: 'Waktu',
      sortable: true,
      sortValue: (r) => r.waktuKegiatan,
      render: (r) => <span className="font-medium">{r.waktuKegiatan || '-'}</span>,
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
      render: (r) => <span className="max-w-[220px] truncate inline-block">{r.keterangan || '-'}</span>,
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
          <button onClick={(e) => { e.stopPropagation(); setToDelete(r); }} className="rounded-md p-1.5 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/40" title="Hapus">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteAgendaPimpinan(toDelete.id);
      await resequenceAgendaPimpinan();
      toast('Agenda berhasil dihapus.', 'success');
      onRefresh();
    } catch {
      toast('Gagal menghapus agenda.', 'error');
    }
  }

  if (view === 'form') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setView('list'); setEditing(null); }}>
          <ArrowLeft size={16} /> Kembali ke daftar
        </Button>
        <div className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
            {editing ? 'Edit Agenda Pimpinan' : 'Tambah Agenda Pimpinan'}
          </h2>
          <AgendaPimpinanForm
            editing={editing}
            onSaved={() => { setView('list'); setEditing(null); onRefresh(); }}
            onCancel={() => { setView('list'); setEditing(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-emerald-100/80 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/70">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Agenda Pimpinan</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{rows.length} agenda tercatat</p>
        </div>
        <Button onClick={() => { setEditing(null); setView('form'); }}>
          <Plus size={16} /> Tambah Agenda
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        searchKeys={['namaKegiatan', 'tempatKegiatan', 'keterangan', 'disposisiPegawai']}
        searchPlaceholder="Cari agenda pimpinan..."
        emptyMessage="Belum ada agenda pimpinan. Klik 'Tambah Agenda' untuk menambahkan."
        initialSort={{ key: 'nomorUrut', dir: 'asc' }}
        onRowClick={(r) => setDetail(r)}
      />

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
    { label: 'Tanggal Kegiatan', value: isoToDisplay(agenda.tanggalKegiatan) || '-' },
    { label: 'Waktu Kegiatan', value: agenda.waktuKegiatan || '-' },
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
