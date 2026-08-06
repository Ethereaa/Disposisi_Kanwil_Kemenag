import { useEffect, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select } from '@/components/ui/Form';
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
  const [busy, setBusy] = useState(false);
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
  }, [editing]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.tanggalKegiatan || !form.waktuKegiatan || !form.namaKegiatan.trim() || !form.tempatKegiatan.trim() || !form.keterangan || !form.disposisiPegawai) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal Kegiatan" required>
          <Input type="date" value={form.tanggalKegiatan} onChange={(e) => update('tanggalKegiatan', e.target.value)} />
        </Field>
        <Field label="Waktu Kegiatan" required hint="Format 24 jam, contoh 14:30">
          <Input type="time" value={form.waktuKegiatan} onChange={(e) => update('waktuKegiatan', e.target.value)} />
        </Field>
        <Field label="Nama Kegiatan" required>
          <Input value={form.namaKegiatan} onChange={(e) => update('namaKegiatan', e.target.value)} placeholder="Nama kegiatan" />
        </Field>
        <Field label="Tempat Kegiatan" required>
          <Input value={form.tempatKegiatan} onChange={(e) => update('tempatKegiatan', e.target.value)} placeholder="Tempat kegiatan" />
        </Field>
        <Field label="Keterangan" required>
          <Select
            value={form.keterangan}
            onChange={(e) => update('keterangan', e.target.value)}
            placeholder="-- Pilih Keterangan --"
            options={AGENDA_KETERANGAN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </Field>
        <Field label="Disposisi Pegawai" required>
          <Input value={form.disposisiPegawai} onChange={(e) => update('disposisiPegawai', e.target.value)} placeholder="Nama pegawai / disposisi" />
        </Field>
      </div>

      <Field label="Lampiran / Scan Dokumen">
        <AttachmentField
          folder="agenda-pimpinan"
          value={form.lampiran}
          onChange={(next) => update('lampiran', next)}
          disabled={busy}
        />
      </Field>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row">
        <Button type="submit" disabled={busy}>
          <Save size={16} /> {busy ? 'Menyimpan...' : 'Simpan'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          <X size={16} /> Batal
        </Button>
      </div>
    </form>
  );
}
