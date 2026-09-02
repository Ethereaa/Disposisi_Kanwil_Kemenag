import { useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field, Input, Select, FormErrorSummary, FormActions } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AGENDA_KETERANGAN_OPTIONS } from '@/types';
import { insertAgendaPimpinanSorted } from '@/lib/db';
import { todayISO } from '@/lib/date';
import { getErrorMessage } from '@/lib/error';
import { useFieldRefs } from '@/lib/useFieldRefs';

// Batch entry for Agenda Pimpinan. Deliberately thin: it collects N sets of the
// same six required fields the single form collects, then writes them one at a
// time through the one create path that exists — insertAgendaPimpinanSorted().
// No new insert helper, no Promise.all, no bulk RPC: the server function has to
// place each row in date order, and it can only do that for one row at a time.
//
// There is no attachment picker here on purpose (Root #3F removes the whole
// attachment system), so every batch row is written with `lampiran: []`.

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

// The same six conditions and the same messages as AgendaPimpinanForm.validate().
// 3B.2 does not relax any of them — optional fields belong to 3C.
const REQUIRED: { field: EditableField; message: string }[] = [
  { field: 'tanggalKegiatan', message: 'Tanggal kegiatan wajib diisi' },
  { field: 'waktuKegiatan', message: 'Waktu kegiatan wajib diisi' },
  { field: 'namaKegiatan', message: 'Nama kegiatan wajib diisi' },
  { field: 'tempatKegiatan', message: 'Tempat kegiatan wajib diisi' },
  { field: 'keterangan', message: 'Keterangan wajib dipilih' },
  { field: 'disposisiPegawai', message: 'Disposisi pegawai wajib diisi' },
];

// One flat error map for every row, keyed `<uid>.<field>`. useFieldRefs()
// memoizes a ref callback per key, so dynamic keys like these register and
// focus exactly like the single form's static ones.
const errKey = (uid: string, field: EditableField) => `${uid}.${field}`;

export function AgendaPimpinanBatchForm({ onCompleted, onPartial, onCancel, onBusyChange }: Props) {
  const [rows, setRows] = useState<BatchRow[]>(() => [makeRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { register, focusField } = useFieldRefs();
  const { toast } = useToast();

  function setSaving(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  function update(uid: string, field: EditableField, value: string) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, [field]: value } : r)));
    const key = errKey(uid, field);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  function addRow() {
    const row = makeRow();
    setRows((rs) => [...rs, row]);
    // Deferred so the focus lands after React has committed the new card.
    setTimeout(() => focusField(errKey(row.uid, 'tanggalKegiatan')), 50);
  }

  // Guarded as well as hidden: the list must never reach zero rows.
  function removeRow(uid: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== uid) : rs));
    setErrors((e) => {
      const next = { ...e };
      for (const { field } of REQUIRED) delete next[errKey(uid, field)];
      return next;
    });
  }

  /** Validates every row. Nothing is written unless this comes back empty. */
  function validateAll(list: BatchRow[]): Record<string, string> {
    const e: Record<string, string> = {};
    for (const row of list) {
      for (const { field, message } of REQUIRED) {
        if (!row[field].trim()) e[errKey(row.uid, field)] = message;
      }
    }
    return e;
  }

  async function saveAll() {
    // Second line of defence against a double submit; the button is already
    // disabled while busy.
    if (busy) return;

    // Validate-all-then-write, never validate-as-you-go: one bad row anywhere
    // in the batch means zero inserts, so the user can fix it without having to
    // reason about which agendas already went through.
    const found = validateAll(rows);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      focusField(firstInvalid);
      toast('Lengkapi semua kolom wajib pada setiap agenda.', 'error');
      return;
    }

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
            tanggalKegiatan: row.tanggalKegiatan,
            waktuKegiatan: row.waktuKegiatan,
            namaKegiatan: row.namaKegiatan.trim(),
            tempatKegiatan: row.tempatKegiatan.trim(),
            keterangan: row.keterangan,
            disposisiPegawai: row.disposisiPegawai.trim(),
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
          setErrors({});
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

  // Positions for the summary lines, so "Nama kegiatan wajib diisi" x4 is
  // attributable. The inline Field error stays unprefixed — it already sits
  // inside the card that names the agenda.
  // `as const` so this is a tuple list, which is what Map's constructor takes.
  const positions = new Map(rows.map((r, i) => [r.uid, i + 1] as const));
  const fieldErrors = Object.entries(errors)
    .filter(([, message]) => !!message)
    .map(([key, message]) => {
      const pos = positions.get(key.slice(0, key.indexOf('.')));
      return { key, message: pos ? `Agenda ${pos}: ${message}` : message };
    });

  return (
    // Not a <form>: Enter inside any of 6xN inputs would submit the whole
    // batch, which is the one action here that must always be deliberate.
    <div className="space-y-5">
      <FormErrorSummary errors={fieldErrors} onJump={focusField} />

      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        Isi beberapa agenda sekaligus. Semua kolom wajib diisi pada setiap agenda — tidak ada data yang
        dikirim sebelum seluruh agenda lengkap. Lampiran tidak tersedia pada input batch.
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
              <Field label="Tanggal Kegiatan" required error={errors[errKey(row.uid, 'tanggalKegiatan')]}>
                <Input
                  ref={register(errKey(row.uid, 'tanggalKegiatan'))}
                  type="date"
                  value={row.tanggalKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'tanggalKegiatan', e.target.value)}
                />
              </Field>
              <Field
                label="Waktu Kegiatan"
                required
                hint="Format 24 jam, contoh 14:30"
                error={errors[errKey(row.uid, 'waktuKegiatan')]}
              >
                <Input
                  ref={register(errKey(row.uid, 'waktuKegiatan'))}
                  type="time"
                  value={row.waktuKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'waktuKegiatan', e.target.value)}
                />
              </Field>
              <Field label="Nama Kegiatan" required error={errors[errKey(row.uid, 'namaKegiatan')]}>
                <Input
                  ref={register(errKey(row.uid, 'namaKegiatan'))}
                  value={row.namaKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'namaKegiatan', e.target.value)}
                  placeholder="Nama kegiatan"
                />
              </Field>
              <Field label="Tempat Kegiatan" required error={errors[errKey(row.uid, 'tempatKegiatan')]}>
                <Input
                  ref={register(errKey(row.uid, 'tempatKegiatan'))}
                  value={row.tempatKegiatan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'tempatKegiatan', e.target.value)}
                  placeholder="Tempat kegiatan"
                />
              </Field>
              <Field label="Keterangan" required error={errors[errKey(row.uid, 'keterangan')]}>
                <Select
                  ref={register(errKey(row.uid, 'keterangan'))}
                  value={row.keterangan}
                  disabled={busy}
                  onChange={(e) => update(row.uid, 'keterangan', e.target.value)}
                  placeholder="-- Pilih Keterangan --"
                  options={AGENDA_KETERANGAN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                />
              </Field>
              <Field label="Disposisi Pegawai" required error={errors[errKey(row.uid, 'disposisiPegawai')]}>
                <Input
                  ref={register(errKey(row.uid, 'disposisiPegawai'))}
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
