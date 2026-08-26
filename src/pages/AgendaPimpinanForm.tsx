import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, FormSection, FormErrorSummary } from '@/components/ui/Form';
import { AttachmentField } from '@/components/ui/AttachmentField';
import { useToast } from '@/components/ui/Toast';
import { AGENDA_KETERANGAN_OPTIONS, type AgendaPimpinan, type Attachment } from '@/types';
import { insertAgendaPimpinanSorted, updateAgendaPimpinan, updateLampiran } from '@/lib/db';
import { todayISO } from '@/lib/date';
import { getErrorMessage } from '@/lib/error';

interface Props {
  editing?: AgendaPimpinan | null;
  onSaved: () => void;
  onCancel: () => void;
}

const emptyForm = {
  tanggalKegiatan: '',
  waktuKegiatan: '',
  namaKegiatan: '',
  tempatKegiatan: '',
  keterangan: '',
  disposisiPegawai: '',
  lampiran: [] as Attachment[],
};

export function AgendaPimpinanForm({ editing, onSaved, onCancel }: Props) {
  const [nomorUrut, setNomorUrut] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Validated controls, so a failed submit can put the cursor on the first
  // field that actually needs attention instead of only colouring it.
  const requiredRefs = useRef<Record<string, HTMLElement | null>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (editing) {
      setNomorUrut(editing.nomorUrut);
      setForm({
        tanggalKegiatan: editing.tanggalKegiatan ?? '',
        waktuKegiatan: editing.waktuKegiatan ?? '',
        namaKegiatan: editing.namaKegiatan,
        tempatKegiatan: editing.tempatKegiatan,
        keterangan: editing.keterangan,
        disposisiPegawai: editing.disposisiPegawai,
        lampiran: editing.lampiran ?? [],
      });
    } else {
      setNomorUrut(1);
      setForm((prev) => ({ ...prev, tanggalKegiatan: todayISO() }));
    }
    setErrors({});
  }, [editing]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  // Exactly the same six conditions that already gated submission — split per
  // field so the message lands next to the empty control instead of only in a
  // toast that says "lengkapi semua kolom wajib" and leaves you hunting.
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.tanggalKegiatan) e.tanggalKegiatan = 'Tanggal kegiatan wajib diisi';
    if (!form.waktuKegiatan) e.waktuKegiatan = 'Waktu kegiatan wajib diisi';
    if (!form.namaKegiatan.trim()) e.namaKegiatan = 'Nama kegiatan wajib diisi';
    if (!form.tempatKegiatan.trim()) e.tempatKegiatan = 'Tempat kegiatan wajib diisi';
    if (!form.keterangan) e.keterangan = 'Keterangan wajib dipilih';
    if (!form.disposisiPegawai) e.disposisiPegawai = 'Disposisi pegawai wajib diisi';
    setErrors(e);
    const firstInvalid = Object.keys(e)[0];
    if (firstInvalid) {
      const el = requiredRefs.current[firstInvalid];
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    }
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!validate()) {
      toast('Lengkapi semua kolom wajib.', 'error');
      return;
    }

    setBusy(true);
    try {
      if (editing) {
        const payload = {
          nomorUrut,
          tanggalKegiatan: form.tanggalKegiatan,
          waktuKegiatan: form.waktuKegiatan,
          namaKegiatan: form.namaKegiatan.trim(),
          tempatKegiatan: form.tempatKegiatan.trim(),
          keterangan: form.keterangan,
          disposisiPegawai: form.disposisiPegawai.trim(),
          lampiran: form.lampiran,
        };
        await updateAgendaPimpinan(editing.id, payload);
      } else {
        const inserted = await insertAgendaPimpinanSorted({
          tanggalKegiatan: form.tanggalKegiatan,
          waktuKegiatan: form.waktuKegiatan,
          namaKegiatan: form.namaKegiatan.trim(),
          tempatKegiatan: form.tempatKegiatan.trim(),
          keterangan: form.keterangan,
          disposisiPegawai: form.disposisiPegawai.trim(),
          lampiran: form.lampiran,
        });
        // insert_agenda_pimpinan_sorted() doesn't take lampiran, so attachments
        // picked before the row existed are attached right after.
        if (form.lampiran.length > 0) {
          await updateLampiran('agenda_pimpinan', inserted.id, form.lampiran);
        }
      }

      toast('Agenda berhasil disimpan.', 'success');
      onSaved();
    } catch (err) {toast(getErrorMessage(err, 'Gagal menyimpan agenda.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const errorMessages = Object.values(errors).filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormErrorSummary messages={errorMessages} />

      <FormSection title="Jadwal" hint="Semua kolom pada bagian ini wajib">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal Kegiatan" required error={errors.tanggalKegiatan}>
            <Input
              ref={(el) => { requiredRefs.current.tanggalKegiatan = el; }}
              type="date"
              value={form.tanggalKegiatan}
              onChange={(e) => update('tanggalKegiatan', e.target.value)}
            />
          </Field>
          <Field label="Waktu Kegiatan" required hint="Format 24 jam, contoh 14:30" error={errors.waktuKegiatan}>
            <Input
              ref={(el) => { requiredRefs.current.waktuKegiatan = el; }}
              type="time"
              value={form.waktuKegiatan}
              onChange={(e) => update('waktuKegiatan', e.target.value)}
            />
          </Field>
          <Field label="Nama Kegiatan" required error={errors.namaKegiatan}>
            <Input
              ref={(el) => { requiredRefs.current.namaKegiatan = el; }}
              value={form.namaKegiatan}
              onChange={(e) => update('namaKegiatan', e.target.value)}
              placeholder="Nama kegiatan"
            />
          </Field>
          <Field label="Tempat Kegiatan" required error={errors.tempatKegiatan}>
            <Input
              ref={(el) => { requiredRefs.current.tempatKegiatan = el; }}
              value={form.tempatKegiatan}
              onChange={(e) => update('tempatKegiatan', e.target.value)}
              placeholder="Tempat kegiatan"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Penugasan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Keterangan" required error={errors.keterangan}>
            <Select
              ref={(el) => { requiredRefs.current.keterangan = el; }}
              value={form.keterangan}
              onChange={(e) => update('keterangan', e.target.value)}
              placeholder="-- Pilih Keterangan --"
              options={AGENDA_KETERANGAN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
            />
          </Field>
          <Field label="Disposisi Pegawai" required error={errors.disposisiPegawai}>
            <Input
              ref={(el) => { requiredRefs.current.disposisiPegawai = el; }}
              value={form.disposisiPegawai}
              onChange={(e) => update('disposisiPegawai', e.target.value)}
              placeholder="Nama pegawai / disposisi"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Lampiran">
        <Field label="Lampiran / Scan Dokumen" asGroup>
          <AttachmentField
            folder="agenda-pimpinan"
            value={form.lampiran}
            onChange={(next) => update('lampiran', next)}
            disabled={busy}
          />
        </Field>
      </FormSection>

      {/* Actions. Sticky to the bottom of the scrolling modal body (whose
          padding the negative margins cancel) so Simpan stays reachable on a
          phone without scrolling the whole form. */}
      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-col gap-2 border-t border-office-border bg-white/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:pb-3 dark:border-slate-700 dark:bg-slate-800/95">
        <Button type="submit" disabled={busy} className="w-full min-h-11 sm:w-auto sm:min-h-10">
          <Save size={16} aria-hidden="true" /> {busy ? 'Menyimpan...' : 'Simpan'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="w-full min-h-11 sm:w-auto sm:min-h-10">
          <X size={16} aria-hidden="true" /> Batal
        </Button>
      </div>
    </form>
  );
}
