import { useEffect, useMemo, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, ExternalLink, CalendarCheck, Briefcase, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { isoToDisplayWithDay, formatDateTime } from '@/lib/date';
import { deleteAgendaPimpinan, resequenceAgendaPimpinan } from '@/lib/db';
import { getErrorMessage } from '@/lib/error';
import type { AgendaPimpinan } from '@/types';
import { AgendaPimpinanForm } from './AgendaPimpinanForm';
import { AgendaPimpinanBatchForm } from './AgendaPimpinanBatchForm';
import { AgendaStatusBadge, DateProximityBadge } from '@/components/ui/StatusBadge';

interface Props {
  rows: AgendaPimpinan[];
  onRefresh: () => void;
  canDelete?: boolean;
  /** Bumped by the global "+ Tambah Cepat" floating button to pop the add form open immediately, even if this page was already mounted. */
  quickAddSignal?: number;
  /** Tells App the signal above has been acted on, so it can drop the token. Without this the token outlives the gesture, and because this page is remounted on every navigation and every refresh(), the add form would reopen itself — on the way back from the menu, and again right after a save. */
  onQuickAddHandled?: () => void;
}

// 'batch' is the multi-row entry modal. It is a peer of 'form', not a mode of
// it: quickAddSignal and every empty-state action still land on 'form'.
type View = 'list' | 'form' | 'batch' | 'detail';

export function AgendaPimpinanPage({ rows, onRefresh, canDelete = false, quickAddSignal, onQuickAddHandled }: Props) {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<AgendaPimpinan | null>(null);
  const [detail, setDetail] = useState<AgendaPimpinan | null>(null);
  const [toDelete, setToDelete] = useState<AgendaPimpinan | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  // Mirrors the batch form's in-flight save; only used to hold the batch modal
  // open while rows are still being written.
  const [batchBusy, setBatchBusy] = useState(false);
  const { toast } = useToast();

  // Opening the add form is a response to a gesture, never to being mounted:
  // the token is consumed here so the next mount starts on the list.
  useEffect(() => {
    if (quickAddSignal === undefined) return;
    setEditing(null);
    setView('form');
    onQuickAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddSignal]);

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
      // Truncation is desktop-only. In a table cell it protects the column
      // width; on a card it would fight the title's two-line clamp and the
      // subtitle, which is where these three fields now live.
      render: (r) => <span className="lg:inline-block lg:max-w-[240px] lg:truncate">{r.namaKegiatan || '-'}</span>,
    },
    {
      key: 'tempatKegiatan',
      header: 'Tempat',
      sortable: true,
      sortValue: (r) => r.tempatKegiatan,
      render: (r) => <span className="lg:inline-block lg:max-w-[220px] lg:truncate">{r.tempatKegiatan || '-'}</span>,
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
      render: (r) => <span className="lg:inline-block lg:max-w-[220px] lg:truncate">{r.disposisiPegawai || '-'}</span>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      width: '150px',
      render: (r) => (
        // 44px on phone/tablet, 36px from `lg` — see IconButton's `row` size.
        // Every handler is unchanged, including the preview window.open target
        // and its noopener/noreferrer flags.
        <div className="flex items-center gap-0.5 lg:gap-1">
          <IconButton
            size="row"
            icon={<ExternalLink size={16} />}
            label="Buka preview agenda di tab baru"
            onClick={(e) => { e.stopPropagation(); window.open(`/agenda-preview/${r.id}`, '_blank', 'noopener,noreferrer'); }}
          />
          <IconButton
            size="row"
            icon={<Eye size={16} />}
            label="Lihat detail agenda"
            onClick={(e) => { e.stopPropagation(); setDetail(r); }}
          />
          <IconButton
            size="row"
            icon={<Pencil size={16} />}
            label="Edit agenda"
            onClick={(e) => { e.stopPropagation(); setEditing(r); setView('form'); }}
          />
          {canDelete && (
            <IconButton
              size="row"
              tone="danger"
              icon={<Trash2 size={16} />}
              label="Hapus agenda"
              onClick={(e) => { e.stopPropagation(); setToDelete(r); }}
            />
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
    <div className="space-y-5">
      <PageHeader
        title="Agenda Pimpinan"
        icon={Briefcase}
        description={`${rows.length} agenda tercatat`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open('/agenda-preview', '_blank', 'noopener,noreferrer')}>
              <ExternalLink size={16} /> Buka Preview Agenda
            </Button>
            <Button variant="outline" onClick={() => setView('batch')}>
              <Layers size={16} /> Input Batch
            </Button>
            <Button onClick={() => { setEditing(null); setView('form'); }}>
              <Plus size={16} /> Tambah Agenda
            </Button>
          </>
        }
      />

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
        // Mobile card hierarchy. An agenda row answers a different question
        // from a letter: not "what is it about?" but "where do I have to be,
        // and when?". So the title is the activity, the subtitle is the place
        // (it was the date, which then repeated itself two lines lower), and
        // date + time form the meta strip. `keterangan` is the attendance
        // state — dihadiri / diwakili / tentatif — so it belongs in the
        // footer status slot, not buried mid-card.
        mobileTitleKey="namaKegiatan"
        mobileSubtitleKey="tempatKegiatan"
        mobileMetaKeys={['tanggalKegiatan', 'waktuKegiatan']}
        mobileStatusKey="keterangan"
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
        open={view === 'batch'}
        // Escape and the backdrop are refused mid-save: the sequential loop
        // tracks which rows already committed, and unmounting it loses that.
        onClose={() => { if (!batchBusy) setView('list'); }}
        title="Input Batch Agenda Pimpinan"
        size="xl"
      >
        <AgendaPimpinanBatchForm
          onBusyChange={setBatchBusy}
          // Whole batch landed: behave exactly like the single form's onSaved.
          onCompleted={() => { setView('list'); onRefresh(); }}
          // Some rows landed, then one failed. The list behind the modal is
          // stale, but the modal keeps the un-saved rows for a retry.
          onPartial={onRefresh}
          onCancel={() => setView('list')}
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
