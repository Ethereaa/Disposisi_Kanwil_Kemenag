import { useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field, Input, Select, FormActions } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AGENDA_KETERANGAN_OPTIONS } from '@/types';
import { insertAgendaPimpinanSorted } from '@/lib/db';
import { todayISO } from '@/lib/date';
import { getErrorMessage } from '@/lib/error';
import { useFieldRefs } from '@/lib/useFieldRefs';

// Batch entry for Agenda Pimpinan. Deliberately thin: it collects N sets of the
// same six fields the single form collects, then writes them one at a time
// through the one create path that exists — insertAgendaPimpinanSorted().
// No new insert helper, no Promise.all, no bulk RPC: the server function has to
// place each row in date order, and it can only do that for one row at a time.
//
// Every field is optional (3C), so rows go in exactly as typed, including rows
// left entirely blank. The only thing that can stop a save is the database.

interface Props {
  /** Every pending agenda was written. Parent closes the modal and refreshes. */
  onCompleted: () => void;
  /** Some agendas were written and then one failed. Parent refreshes its data
   *  but leaves the modal open so the rest can be retried. */
  onPartial: () => void;
  onCancel: () => void;
  /** Mirrors the in-flight save, so the parent can refuse to close the modal
   *  while the sequential loop is still running. */
  onBusyChange?: (busy: boolean) => void;
}

// Row identity for React keys and error keys only. The visible "Agenda N"
// label is this list's position; it is never the database nomor_urut, which
// insert_agenda_pimpinan_sorted() assigns from the activity date.
let uidSeq = 0;

interface BatchRow {
  uid: string;
  tanggalKegiatan: string;
  waktuKegiatan: string;
  namaKegiatan: string;
  tempatKegiatan: string;
  keterangan: string;
  disposisiPegawai: string;
  /** Message from the last attempt that threw on this row, else null. */
  failed: string | null;
}

type EditableField = Exclude<keyof BatchRow, 'uid' | 'failed'>;

function makeRow(): BatchRow {
  return {
    uid: `b${++uidSeq}`,
    // Same fresh-create default as the single form: today, everything else blank.
    tanggalKegiatan: todayISO(),
    waktuKegiatan: '',
    namaKegiatan: '',
    tempatKegiatan: '',
    keterangan: '',
    disposisiPegawai: '',
    failed: null,
  };
}

// One flat ref key per control, `<uid>.<field>`. useFieldRefs() memoizes a ref
// callback per key, so dynamic keys like these register and focus exactly like
// the single form's static ones. Only the date input is registered — it is the
// one field a newly added row focuses.
const fieldKey = (uid: string, field: EditableField) => `${uid}.${field}`;

export function AgendaPimpinanBatchForm({ onCompleted, onPartial, onCancel, onBusyChange }: Props) {
  const [rows, setRows] = useState<BatchRow[]>(() => [makeRow()]);
  const [busy, setBusy] = useState(false);
  const { register, focusField } = useFieldRefs();
  const { toast } = useToast();

  function setSaving(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  function update(uid: string, field: EditableField, value: string) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    const row = makeRow();
    setRows((rs) => [...rs, row]);
    // Deferred so the focus lands after React has committed the new card.
    setTimeout(() => focusField(fieldKey(row.uid, 'tanggalKegiatan')), 50);
  }

  // Guarded as well as hidden: the list must never reach zero rows.
  function removeRow(uid: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== uid) : rs));
  }

  async function saveAll() {
    // Second line of defence against a double submit; the button is already
    // disabled while busy.
    if (busy) return;

    setSaving(true);
    // Snapshot the queue: the loop below must iterate over a fixed list rather
    // than over state that a re-render could replace mid-flight.
    const pending = rows;
    // Clear any marker left by a previous failed attempt.
    setRows(pending.map((r) => (r.failed === null ? r : { ...r, failed: null })));

    try {
      for (let i = 0; i < pending.length; i++) {
        const row = pending[i];
        try {
          await insertAgendaPimpinanSorted({
            // The RPC parameter and the column are PostgreSQL `date`; a cleared
            // date input reads '', which is not a date. Everything else goes in
            // as typed, empty strings included.
            tanggalKegiatan: row.tanggalKegiatan || null,
            waktuKegiatan: row.waktuKegiatan,
            namaKegiatan: row.namaKegiatan.trim(),
            tempatKegiatan: row.tempatKegiatan.trim(),
            keterangan: row.keterangan,
            disposisiPegawai: row.disposisiPegawai.trim(),
            // Still required by the model; the field itself goes away in 3F.2.
            lampiran: [],
          });
        } catch (err) {
          const message = getErrorMessage(err, 'Gagal menyimpan agenda.');
          // Stop at the first failure. Rows 0..i-1 are already committed, so
          // they are dropped from the queue outright — keeping them would send
          // them a second time when the user retries, creating duplicates.
          // Row i keeps every character the user typed and is marked as the
          // failure; rows after it were never attempted and are untouched. The
          // remaining cards simply renumber, because the labels are positions.
          setRows(pending.slice(i).map((r, offset) => (offset === 0 ? { ...r, failed: message } : r)));
          toast(message, 'error');
          // Something did land in the database, so the list behind the modal is
          // now stale. Refresh it, but leave the modal open for the retry.
          if (i > 0) onPartial();
          return;
        }
      }

      toast('Semua agenda berhasil disimpan.', 'success');
      onCompleted();
    } finally {
      setSaving(false);
    }
  }

  return (
    // Not a <form>: Enter inside any of 6xN inputs would submit the whole
    // batch, which is the one action here that must always be deliberate.
    <div className="space-y-5">
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        Isi informasi yang tersedia pada setiap agenda. Kolom yang belum diketahui dapat dikosongkan.
      </p>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <section
            key={row.uid}
            aria-label={`Agenda ${index + 1}`}
            className={`surface-subtle p-4 ${row.failed ? 'border-rose-300 dark:border-rose-500/50' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Agenda {index + 1}
              </h3>
              {/* Hidden entirely at one row, so there is no way to empty the batch. */}
              {rows.length > 1 && (
                <IconButton
                  size="row"
                  tone="danger"
                  icon={<Trash2 size={16} />}
                  label={`Hapus Agenda ${index + 1}`}
                  disabled={busy}
                  onClick={() => removeRow(row.uid)}
                />
              )}
            </div>

            {row.failed && (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">Gagal disimpan: {row.failed}</span>
              </p>
            )}

            {/* Cards and a 2-up grid rather than a wide table, so 360px gets a
                readable stack instead of a horizontal scroller. */}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Tanggal Kegiatan">
                <Input
                  ref={register(fieldKey(row.uid, 'tanggalKegiatan'))}
                  type="date"
                  value={row.tanggalKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'tanggalKegiatan', e.target.value)}
                />
              </Field>
              <Field label="Waktu Kegiatan" hint="Format 24 jam, contoh 14:30">
                <Input
                  type="time"
                  value={row.waktuKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'waktuKegiatan', e.target.value)}
                />
              </Field>
              <Field label="Nama Kegiatan">
                <Input
                  value={row.namaKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'namaKegiatan', e.target.value)}
                  placeholder="Nama kegiatan"
                />
              </Field>
              <Field label="Tempat Kegiatan">
                <Input
                  value={row.tempatKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'tempatKegiatan', e.target.value)}
                  placeholder="Tempat kegiatan"
                />
              </Field>
              <Field label="Keterangan">
                <Select
                  value={row.keterangan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'keterangan', e.target.value)}
                  placeholder="-- Pilih Keterangan --"
                  options={AGENDA_KETERANGAN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                />
              </Field>
              <Field label="Disposisi Pegawai">
                <Input
                  value={row.disposisiPegawai}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'disposisiPegawai', e.target.value)}
                  placeholder="Nama pegawai / disposisi"
                />
              </Field>
            </div>
          </section>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addRow} disabled={busy} className="w-full sm:w-auto">
        <Plus size={16} aria-hidden="true" /> Tambah Agenda
      </Button>

      <FormActions>
        <Button type="button" onClick={saveAll} isLoading={busy} className="w-full sm:w-auto">
          {!busy && <Save size={16} aria-hidden="true" />}
          {busy ? 'Menyimpan...' : `Simpan Semua (${rows.length})`}
        </Button>
        {/* Disabled mid-save: closing the modal while the loop is running would
            lose track of which rows already committed. */}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
          <X size={16} aria-hidden="true" /> Batal
        </Button>
      </FormActions>
    </div>
  );
}
