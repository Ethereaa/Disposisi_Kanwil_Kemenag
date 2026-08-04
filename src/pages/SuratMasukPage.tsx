import { useEffect, useMemo, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, Inbox, Filter, Printer, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Form';
import { AttachmentField } from '@/components/ui/AttachmentField';
import { LampiranCell } from '@/components/ui/LampiranCell';
import { DisposisiStatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import type { SuratMasuk, StatusDisposisi } from '@/types';
import { TUJUAN_DISPOSISI, STATUS_DISPOSISI, STATUS_DISPOSISI_LABEL } from '@/types';
import { isoToDisplay, formatDateTime, isWithinRange, businessDaysSince } from '@/lib/date';
import { deleteRow, resequenceSuratMasukByNomorAgenda, updateStatusDisposisi, getOverdueThresholdDays } from '@/lib/db';
import { getErrorMessage } from '@/lib/error';
import { SuratMasukForm } from './SuratMasukForm';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { printSuratMasuk } from '@/lib/printDisposisi';

interface Props {
  rows: SuratMasuk[];
  onRefresh: () => void;
  canDelete?: boolean;
  /** Bumped by the global "+ Tambah Cepat" floating button to pop the add form open immediately, even if this page was already mounted. */
  quickAddSignal?: number;
}

type View = 'list' | 'form' | 'detail';

export function SuratMasukPage({ rows, onRefresh, canDelete = true, quickAddSignal }: Props) {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<SuratMasuk | null>(null);
  const [detail, setDetail] = useState<SuratMasuk | null>(null);
  const [toDelete, setToDelete] = useState<SuratMasuk | null>(null);
  const [tujuanFilter, setTujuanFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [overdueThreshold, setOverdueThreshold] = useState(3);
  const { toast } = useToast();

  useEffect(() => {
    if (quickAddSignal === undefined) return;
    setEditing(null);
    setView('form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddSignal]);

  useEffect(() => {
    getOverdueThresholdDays().then(setOverdueThreshold).catch(() => {
      // Non-critical — falls back to the component's default of 3.
    });
  }, []);

  function isOverdue(r: SuratMasuk): boolean {
    return r.statusDisposisi === 'diproses' && businessDaysSince(r.statusUpdatedAt) >= overdueThreshold;
  }

  async function handleStatusChange(r: SuratMasuk, next: StatusDisposisi) {
    if (next === r.statusDisposisi) return;
    try {
      await updateStatusDisposisi(r.id, next);
      toast(`Status disposisi diubah ke "${STATUS_DISPOSISI_LABEL[next]}".`, 'success');
      onRefresh();
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal mengubah status disposisi.'), 'error');
    }
  }

  const filteredRows = useMemo(() => {
    let out = rows.filter((r) => !removedIds.has(r.id));
    if (tujuanFilter) out = out.filter((r) => r.tujuanDisposisi === tujuanFilter);
    if (statusFilter === 'terlambat') out = out.filter((r) => isOverdue(r));
    else if (statusFilter) out = out.filter((r) => r.statusDisposisi === statusFilter);
    if (dateStart || dateEnd) out = out.filter((r) => isWithinRange(r.tanggalDiterima, dateStart, dateEnd));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tujuanFilter, statusFilter, dateStart, dateEnd, removedIds, overdueThreshold]);

  const overdueCount = useMemo(
    () => rows.filter((r) => !removedIds.has(r.id) && isOverdue(r)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, removedIds, overdueThreshold],
  );

  const columns: Column<SuratMasuk>[] = [
    {
      key: 'nomorUrut',
      header: 'No.',
      sortable: true,
      sortValue: (r) => r.nomorUrut,
      width: '60px',
      render: (r) => <span className="font-semibold tabular-nums text-office-text dark:text-slate-200">{r.nomorUrut}</span>,
    },
    {
      key: 'nomorSurat',
      header: 'Nomor Surat',
      sortable: true,
      sortValue: (r) => r.nomorSurat,
      render: (r) => <span className="font-medium">{r.nomorSurat || '-'}</span>,
    },
    {
      key: 'nomorAgenda',
      header: 'Agenda',
      sortable: true,
      sortValue: (r) => r.nomorAgenda,
      render: (r) => r.nomorAgenda || '-',
    },
    {
      key: 'tanggalSurat',
      header: 'Tgl Surat',
      sortable: true,
      sortValue: (r) => r.tanggalSurat ?? '',
    },
    {
      key: 'perihal',
      header: 'Perihal',
      sortable: true,
      sortValue: (r) => r.perihal,
      render: (r) => <span className="max-w-[220px] truncate inline-block">{r.perihal || '-'}</span>,
    },
    {
      key: 'tujuanDisposisi',
      header: 'Tujuan',
      sortable: true,
      sortValue: (r) => r.tujuanDisposisi,
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 w-fit">
            {r.tujuanDisposisi}
          </span>
          {r.subDisposisi && (
            <span className="text-xs text-office-subtext dark:text-slate-400">{r.subDisposisi}</span>
          )}
        </div>
      ),
    },
    {
      key: 'tanggalDiterima',
      header: 'Tgl Diterima',
      sortable: true,
      sortValue: (r) => r.tanggalDiterima ?? '',
    },
    {
      key: 'statusDisposisi',
      header: 'Status',
      width: '150px',
      sortable: true,
      sortValue: (r) => r.statusDisposisi,
      render: (r) => {
        const overdue = isOverdue(r);
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-start gap-1">
            <select
              value={r.statusDisposisi}
              onChange={(e) => handleStatusChange(r, e.target.value as StatusDisposisi)}
              className={`rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-office-primary/30 dark:bg-slate-800 ${
                overdue
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                  : r.statusDisposisi === 'selesai'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : r.statusDisposisi === 'diproses'
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-office-border bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-700/40 dark:text-slate-300'
              }`}
            >
              {STATUS_DISPOSISI.map((s) => (
                <option key={s} value={s}>{STATUS_DISPOSISI_LABEL[s]}</option>
              ))}
            </select>
            {overdue && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                <AlertTriangle size={11} /> Terlambat
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'lampiran',
      header: 'Lampiran',
      width: '90px',
      render: (r) => <LampiranCell lampiran={r.lampiran} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      width: '110px',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setDetail(r); }} className="p-1.5 rounded-md text-office-subtext hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40" title="Lihat">
            <Eye size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); printSuratMasuk(r); }} className="p-1.5 rounded-md text-office-subtext hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" title="Cetak Lembar Disposisi">
            <Printer size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(r); setView('form'); }} className="p-1.5 rounded-md text-office-subtext hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900/40" title="Edit">
            <Pencil size={16} />
          </button>
          {canDelete && (
            <button onClick={(e) => { e.stopPropagation(); setToDelete(r); }} className="p-1.5 rounded-md text-office-subtext hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40" title="Hapus">
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
    setRemovedIds((prev) => new Set(prev).add(id));
    try {
      await deleteRow('surat_masuk', id);
      await resequenceSuratMasukByNomorAgenda();
      toast('Data berhasil dihapus.', 'success');
      onRefresh();
    } catch (err) {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast(getErrorMessage(err, 'Gagal menghapus data.'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="soft-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-office-text dark:text-slate-100">Daftar Surat Masuk</h2>
          <p className="text-sm text-office-subtext dark:text-slate-400">
            {filteredRows.length} surat tercatat
            {overdueCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                <AlertTriangle size={12} /> {overdueCount} terlambat diproses
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setView('form'); }}>
          <Plus size={16} /> Tambah Surat
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        searchKeys={['nomorSurat', 'nomorAgenda', 'pengirim', 'perihal', 'tujuanDisposisi', 'isiDisposisi']}
        searchPlaceholder="Cari surat masuk..."
        emptyMessage="Belum ada surat masuk."
        emptyIcon={Inbox}
        emptyActionLabel="Tambah Surat"
        onEmptyAction={() => { setEditing(null); setView('form'); }}
        initialSort={{ key: 'nomorUrut', dir: 'asc' }}
        mobileTitleKey="perihal"
        mobileSubtitleKey="tujuanDisposisi"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={14} className="text-office-subtext dark:text-slate-400" />
            <Select
              value={tujuanFilter}
              onChange={(e) => setTujuanFilter(e.target.value)}
              placeholder="Semua Tujuan"
              options={TUJUAN_DISPOSISI.map((t) => ({ value: t, label: t }))}
              className="w-44"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="Semua Status"
              options={[
                ...STATUS_DISPOSISI.map((s) => ({ value: s, label: STATUS_DISPOSISI_LABEL[s] })),
                { value: 'terlambat', label: 'Terlambat' },
              ]}
              className="w-40"
            />
            <DateRangeFilter start={dateStart} end={dateEnd} onChange={(s, e) => { setDateStart(s); setDateEnd(e); }} />
          </div>
        }
        onRowClick={(r) => setDetail(r)}
        rowClassName={(r) => (isOverdue(r) ? 'border-l-4 border-l-red-400 dark:border-l-red-500' : '')}
      />

      <Modal
        open={view === 'form'}
        onClose={() => { setView('list'); setEditing(null); }}
        title={editing ? 'Edit Surat Masuk' : 'Tambah Surat Masuk'}
        size="lg"
      >
        <SuratMasukForm
          editing={editing}
          onSaved={() => { setView('list'); setEditing(null); onRefresh(); }}
          onCancel={() => { setView('list'); setEditing(null); }}
        />
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail Surat Masuk"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button>
            <Button variant="outline" onClick={() => { if (detail) printSuratMasuk(detail); }}>
              <Printer size={16} /> Cetak
            </Button>
            <Button onClick={() => { if (detail) { setEditing(detail); setView('form'); setDetail(null); } }}>
              <Pencil size={16} /> Edit
            </Button>
          </>
        }
      >
        {detail && <DetailContent s={detail} overdueThreshold={overdueThreshold} />}
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus Surat Masuk"
        message={`Yakin ingin menghapus surat no. ${toDelete?.nomorUrut} (${toDelete?.perihal || 'tanpa perihal'})? Tindakan ini tidak dapat dibatalkan.`}
      />
    </div>
  );
}

function DetailContent({ s, overdueThreshold }: { s: SuratMasuk; overdueThreshold: number }) {
  const items: { label: string; value: string }[] = [
    { label: 'Nomor Urut', value: String(s.nomorUrut) },
    { label: 'Nomor Surat', value: s.nomorSurat || '-' },
    { label: 'Nomor Agenda', value: s.nomorAgenda || '-' },
    { label: 'Tanggal Surat', value: isoToDisplay(s.tanggalSurat) || '-' },
    { label: 'Tanggal Diterima', value: isoToDisplay(s.tanggalDiterima) || '-' },
    { label: 'Pengirim Surat', value: s.pengirim || '-' },
    { label: 'Perihal Surat', value: s.perihal || '-' },
    { label: 'Tujuan Disposisi', value: s.tujuanDisposisi },
    { label: 'Sub Disposisi', value: s.subDisposisi || '-' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DisposisiStatusBadge value={s.statusDisposisi} overdue={s.statusDisposisi === 'diproses' && businessDaysSince(s.statusUpdatedAt) >= overdueThreshold} />
        <span className="text-xs text-office-subtext dark:text-slate-400">
          Status diperbarui: {formatDateTime(s.statusUpdatedAt)}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
        {items.map((it) => (
          <div key={it.label} className="border-b border-office-border dark:border-slate-700/60 pb-2">
            <p className="text-xs text-office-subtext dark:text-slate-400">{it.label}</p>
            <p className="text-sm font-medium text-office-text dark:text-slate-200">{it.value}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-xs text-office-subtext dark:text-slate-400 mb-1">Isi Disposisi</p>
        <p className="text-sm text-office-text dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 border border-office-border dark:border-slate-700">{s.isiDisposisi || '-'}</p>
      </div>
      <div>
        <p className="text-xs text-office-subtext dark:text-slate-400 mb-1">Keterangan</p>
        <p className="text-sm text-office-text dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 border border-office-border dark:border-slate-700">{s.keterangan || '-'}</p>
      </div>
      <div>
        <p className="text-xs text-office-subtext dark:text-slate-400 mb-1">Lampiran</p>
        <AttachmentField folder="surat-masuk" value={s.lampiran} onChange={() => {}} readOnly />
      </div>
      <p className="text-xs text-office-subtext dark:text-slate-500 pt-2 border-t border-office-border dark:border-slate-700">
        Dibuat: {formatDateTime(s.createdAt)} · Diperbarui: {formatDateTime(s.updatedAt)}
      </p>
    </div>
  );
}
