import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, FormSection, FormActions } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AGENDA_KETERANGAN_OPTIONS, type AgendaPimpinan } from '@/types';
import { insertAgendaPimpinanSorted, updateAgendaPimpinan } from '@/lib/db';
import { todayISO } from '@/lib/date';
import { getErrorMessage } from '@/lib/error';
import { useFieldRefs } from '@/lib/useFieldRefs';

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
};

export function AgendaPimpinanForm({ editing, onSaved, onCancel }: Props) {
  const [nomorUrut, setNomorUrut] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  // Only the date control is registered: nothing here is validated any more, so
  // the sole focus target left is the one "Simpan & Input Berikutnya" returns to.
  const { register, focusField } = useFieldRefs();
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
      });
    } else {
      setNomorUrut(1);
      setForm((prev) => ({ ...prev, tanggalKegiatan: todayISO() }));
    }
  }, [editing]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // `stay` is the "Simpan & Input Berikutnya" path: same insert, but the form is
  // recycled for the next entry instead of handing control back to the parent.
  // Mirrors SuratKeluarForm.save().
  //
  // Nothing gates this. Every business field on an agenda is optional (3C), so a
  // partially filled — or even entirely empty — agenda is a legitimate save.
  async function save(stay: boolean) {
    setBusy(true);
    try {
      // The one value that cannot go through as typed: the RPC and the column are
      // PostgreSQL `date`, and a cleared date input reads '', not null.
      const tanggalKegiatan = form.tanggalKegiatan || null;

      if (editing) {
        const payload = {
          nomorUrut,
          tanggalKegiatan,
          waktuKegiatan: form.waktuKegiatan,
          namaKegiatan: form.namaKegiatan.trim(),
          tempatKegiatan: form.tempatKegiatan.trim(),
          keterangan: form.keterangan,
          disposisiPegawai: form.disposisiPegawai.trim(),
        };
        await updateAgendaPimpinan(editing.id, payload);
      } else {
        await insertAgendaPimpinanSorted({
          tanggalKegiatan,
          waktuKegiatan: form.waktuKegiatan,
          namaKegiatan: form.namaKegiatan.trim(),
          tempatKegiatan: form.tempatKegiatan.trim(),
          keterangan: form.keterangan,
          disposisiPegawai: form.disposisiPegawai.trim(),
        });
      }

      // `&& !editing` is belt and braces: the button that passes true is not
      // rendered in edit mode, so this can only ever be a create.
      if (stay && !editing) {
        toast('Agenda berhasil disimpan. Silakan input agenda berikutnya.', 'success');
        setNomorUrut(1);
        // Same fresh-create state the mount effect builds: emptyForm with
        // today's date.
        setForm({ ...emptyForm, tanggalKegiatan: todayISO() });
        // Deferred like SuratKeluarForm's reset focus, so the focus lands after
        // React has committed the cleared form.
        setTimeout(() => focusField('tanggalKegiatan'), 50);
      } else {
        toast('Agenda berhasil disimpan.', 'success');
        onSaved();
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal menyimpan agenda.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Jadwal" hint="Isi sesuai informasi yang tersedia">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal Kegiatan">
            <Input
              ref={register('tanggalKegiatan')}
              type="date"
              value={form.tanggalKegiatan}
              onChange={(e) => update('tanggalKegiatan', e.target.value)}
            />
          </Field>
          <Field label="Waktu Kegiatan" hint="Format 24 jam, contoh 14:30">
            <Input
              type="time"
              value={form.waktuKegiatan}
              onChange={(e) => update('waktuKegiatan', e.target.value)}
            />
          </Field>
          <Field label="Nama Kegiatan">
            <Input
              value={form.namaKegiatan}
              onChange={(e) => update('namaKegiatan', e.target.value)}
              placeholder="Nama kegiatan"
            />
          </Field>
          <Field label="Tempat Kegiatan">
            <Input
              value={form.tempatKegiatan}
              onChange={(e) => update('tempatKegiatan', e.target.value)}
              placeholder="Tempat kegiatan"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Penugasan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Keterangan">
            <Select
              value={form.keterangan}
              onChange={(e) => update('keterangan', e.target.value)}
              placeholder="-- Pilih Keterangan --"
              options={AGENDA_KETERANGAN_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
            />
          </Field>
          <Field label="Disposisi Pegawai">
            <Input
              value={form.disposisiPegawai}
              onChange={(e) => update('disposisiPegawai', e.target.value)}
              placeholder="Nama pegawai / disposisi"
            />
          </Field>
        </div>
      </FormSection>

      <FormActions>
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          <Save size={16} aria-hidden="true" /> {busy ? 'Menyimpan...' : 'Simpan'}
        </Button>
        {!editing && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => save(true)} className="w-full sm:w-auto">
            <Plus size={16} aria-hidden="true" /> Simpan &amp; Input Berikutnya
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
          <X size={16} aria-hidden="true" /> Batal
        </Button>
      </FormActions>
    </form>
  );
}
