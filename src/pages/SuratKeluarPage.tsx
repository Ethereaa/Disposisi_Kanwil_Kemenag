import { useEffect, useMemo, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, Filter, Printer, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Form';
import { IconButton } from '@/components/ui/IconButton';
import { SuratKeluarStatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import type { SuratKeluar } from '@/types';
import { isoToDisplay, formatDateTime, isWithinRange } from '@/lib/date';
import { deleteRow } from '@/lib/db';
import { getErrorMessage } from '@/lib/error';
import { SuratKeluarForm } from './SuratKeluarForm';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { printSuratKeluar } from '@/lib/printDisposisi';

interface Props {
  rows: SuratKeluar[];
  onRefresh: () => void;
  canDelete?: boolean;
  /** Bumped by the global "+ Tambah Cepat" floating button to pop the add form open immediately, even if this page was already mounted. */
  quickAddSignal?: number;
  /** Tells App the signal above has been acted on, so it can drop the token. Without this the token outlives the gesture, and because this page is remounted on every navigation and every refresh(), the add form would reopen itself — on the way back from the menu, and again right after a save. */
  onQuickAddHandled?: () => void;
}

type View = 'list' | 'form' | 'detail';
type StatusFilter = '' | 'signed' | 'unsigned';

export function SuratKeluarPage({ rows, onRefresh, canDelete = false, quickAddSignal, onQuickAddHandled }: Props) {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<SuratKeluar | null>(null);
  const [detail, setDetail] = useState<SuratKeluar | null>(null);
  const [toDelete, setToDelete] = useState<SuratKeluar | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
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

  const filteredRows = useMemo(() => {
    let out = rows.filter((r) => !removedIds.has(r.id));
    if (statusFilter === 'signed') out = out.filter((r) => r.ditandatangani);
    if (statusFilter === 'unsigned') out = out.filter((r) => !r.ditandatangani);
    if (dateStart || dateEnd) out = out.filter((r) => isWithinRange(r.tanggalSurat, dateStart, dateEnd));
    return out;
  }, [rows, statusFilter, dateStart, dateEnd, removedIds]);

  const columns: Column<SuratKeluar>[] = [
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
      key: 'tanggalSurat',
      header: 'Tgl Surat',
      sortable: true,
      sortValue: (r) => r.tanggalSurat ?? '',
      // With no render this printed the raw stored ISO ("2026-08-15") while
      // the detail modal formatted the very same field. sortValue still reads
      // the ISO, so the ordering this column produces is unchanged.
      render: (r) => <span className="whitespace-nowrap">{isoToDisplay(r.tanggalSurat) || '-'}</span>,
    },
    {
      key: 'pengirim',
      header: 'Pengirim',
      sortable: true,
      sortValue: (r) => r.pengirim,
      // Truncation is desktop-only — on a card it would clip the subtitle
      // that now carries this field.
      render: (r) => <span className="lg:inline-block lg:max-w-[180px] lg:truncate">{r.pengirim || '-'}</span>,
    },
    {
      key: 'perihal',
      header: 'Perihal',
      sortable: true,
      sortValue: (r) => r.perihal,
      render: (r) => <span className="lg:inline-block lg:max-w-[240px] lg:truncate">{r.perihal || '-'}</span>,
    },
    {
      key: 'ditandatangani',
      header: 'Status TTD',
      sortable: true,
      sortValue: (r) => (r.ditandatangani ? 1 : 0),
      render: (r) => <SuratKeluarStatusBadge value={r.ditandatangani} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      width: '150px',
      render: (r) => (
        // 44px on phone/tablet, 36px from `lg` — see IconButton's `row` size.
        // Handlers, including stopPropagation, are byte-for-byte the same.
        <div className="flex items-center gap-0.5 lg:gap-1">
          <IconButton
            size="row"
            icon={<Eye size={16} />}
            label="Lihat detail surat"
            onClick={(e) => { e.stopPropagation(); setDetail(r); }}
          />
          <IconButton
            size="row"
            icon={<Printer size={16} />}
            label="Cetak surat keluar"
            onClick={(e) => { e.stopPropagation(); printSuratKeluar(r); }}
          />
          <IconButton
            size="row"
            icon={<Pencil size={16} />}
            label="Edit surat"
            onClick={(e) => { e.stopPropagation(); setEditing(r); setView('form'); }}
          />
          {canDelete && (
            <IconButton
              size="row"
              tone="danger"
              icon={<Trash2 size={16} />}
              label="Hapus surat"
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
    setRemovedIds((prev) => new Set(prev).add(id));
    try {
      await deleteRow('surat_keluar', id);
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
    <div className="space-y-5">
      <PageHeader
        title="Surat Keluar"
        icon={Send}
        description={`${filteredRows.length} surat tercatat`}
        actions={
          <Button onClick={() => { setEditing(null); setView('form'); }}>
            <Plus size={16} /> Tambah Surat
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={filteredRows}
        searchKeys={['nomorSurat', 'pengirim', 'perihal', 'keterangan']}
        searchPlaceholder="Cari surat keluar..."
        emptyMessage="Belum ada surat keluar."
        emptyIcon={Send}
        emptyActionLabel="Tambah Surat"
        onEmptyAction={() => { setEditing(null); setView('form'); }}
        initialSort={{ key: 'nomorUrut', dir: 'asc' }}
        // Mobile card hierarchy, and the fix for the boolean-subtitle bug:
        // `mobileSubtitleKey` pointed at `ditandatangani`, so the line under
        // every card title was the signature chip — a state, not an identity,
        // and it was already the loudest thing on the card. The subtitle now
        // answers "who is this letter to?" (`pengirim`, which on an outgoing
        // letter is the counterparty), the signature state moves to the footer
        // band where the eye looks for status, and the date joins the meta
        // strip. No data model, filter or sort change: `ditandatangani` is
        // still its own sortable column rendering the same
        // <SuratKeluarStatusBadge>, just in a different slot on the card.
        //
        // `nomorSurat` sits beside the date in that strip because the strip is
        // specified as two or three fields (see DataTable's mobileMetaKeys) and
        // the date alone would leave it a single orphan line. It was already on
        // the card, one tier lower, in the SUPPORTING list.
        mobileTitleKey="perihal"
        mobileSubtitleKey="pengirim"
        mobileMetaKeys={['tanggalSurat', 'nomorSurat']}
        mobileStatusKey="ditandatangani"
        filters={
          // `Select` forwards className to the <select>, not the wrapper, so
          // the fixed width needs a sizing wrapper to become responsive.
          // Full-bleed on a phone, back to w-48 from `sm`.
          <div className="flex w-full flex-wrap items-center gap-2">
            <Filter size={14} className="hidden shrink-0 text-office-subtext dark:text-slate-400 sm:block" aria-hidden="true" />
            <div className="w-full min-w-0 sm:w-48">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                placeholder="Semua Status"
                options={[
                  { value: 'signed', label: 'Sudah Ditandatangani' },
                  { value: 'unsigned', label: 'Belum Ditandatangani' },
                ]}
                aria-label="Filter status tanda tangan"
              />
            </div>
            <DateRangeFilter start={dateStart} end={dateEnd} onChange={(s, e) => { setDateStart(s); setDateEnd(e); }} />
          </div>
        }
        onRowClick={(r) => setDetail(r)}
      />

      <Modal
        open={view === 'form'}
        onClose={() => { setView('list'); setEditing(null); }}
        title={editing ? 'Edit Surat Keluar' : 'Tambah Surat Keluar'}
        size="lg"
      >
        <SuratKeluarForm
          editing={editing}
          onSaved={() => { setView('list'); setEditing(null); onRefresh(); }}
          onCancel={() => { setView('list'); setEditing(null); }}
        />
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail Surat Keluar"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button>
            <Button variant="outline" onClick={() => { if (detail) printSuratKeluar(detail); }}>
              <Printer size={16} /> Cetak
            </Button>
            <Button onClick={() => { if (detail) { setEditing(detail); setView('form'); setDetail(null); } }}>
              <Pencil size={16} /> Edit
            </Button>
          </>
        }
      >
        {detail && <DetailContent s={detail} />}
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus Surat Keluar"
        message={`Yakin ingin menghapus surat no. ${toDelete?.nomorUrut} (${toDelete?.perihal || 'tanpa perihal'})? Tindakan ini tidak dapat dibatalkan.`}
      />
    </div>
  );
}

function DetailContent({ s }: { s: SuratKeluar }) {
  const items: { label: string; value: string }[] = [
    { label: 'Nomor Urut', value: String(s.nomorUrut) },
    { label: 'Nomor Surat', value: s.nomorSurat || '-' },
    { label: 'Tanggal Surat', value: isoToDisplay(s.tanggalSurat) || '-' },
    { label: 'Pengirim Surat', value: s.pengirim || '-' },
    { label: 'Perihal Surat', value: s.perihal || '-' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
        {items.map((it) => (
          <div key={it.label} className="border-b border-office-border dark:border-slate-700/60 pb-2">
            <p className="text-xs text-office-subtext dark:text-slate-400">{it.label}</p>
            <p className="text-sm font-medium text-office-text dark:text-slate-200">{it.value}</p>
          </div>
        ))}
        <div className="border-b border-office-border dark:border-slate-700/60 pb-2">
          <p className="text-xs text-office-subtext dark:text-slate-400">Status Tanda Tangan</p>
          <p className="mt-0.5">
            <SuratKeluarStatusBadge value={s.ditandatangani} />
          </p>
        </div>
      </div>
      <div>
        <p className="text-xs text-office-subtext dark:text-slate-400 mb-1">Keterangan</p>
        <p className="text-sm text-office-text dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 border border-office-border dark:border-slate-700">{s.keterangan || '-'}</p>
      </div>
      <p className="text-xs text-office-subtext dark:text-slate-500 pt-2 border-t border-office-border dark:border-slate-700">
        Dibuat: {formatDateTime(s.createdAt)} · Diperbarui: {formatDateTime(s.updatedAt)}
      </p>
    </div>
  );
}
