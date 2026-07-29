import { useEffect, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AGENDA_KETERANGAN_OPTIONS, type AgendaPimpinan } from '@/types';
import { insertAgendaPimpinan, updateAgendaPimpinan, getNextNomorUrut } from '@/lib/db';
import { todayISO } from '@/lib/date';

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
      (async () => {
        const next = await getNextNomorUrut('agenda_pimpinan');
        setNomorUrut(next);
        setForm((prev) => ({ ...prev, tanggalKegiatan: todayISO() }));
      })();
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
      const payload = {
        nomorUrut,
        tanggalKegiatan: form.tanggalKegiatan,
        waktuKegiatan: form.waktuKegiatan,
        namaKegiatan: form.namaKegiatan.trim(),
        tempatKegiatan: form.tempatKegiatan.trim(),
        keterangan: form.keterangan,
        disposisiPegawai: form.disposisiPegawai.trim(),
      };

      if (editing) {
        await updateAgendaPimpinan(editing.id, payload);
      } else {
        await insertAgendaPimpinan(payload);
      }

      toast('Agenda berhasil disimpan.', 'success');
      onSaved();
    } catch {
      toast('Gagal menyimpan agenda.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-emerald-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {nomorUrut}
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Nomor Urut (otomatis)</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Agenda Pimpinan</p>
        </div>
      </div>

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
        <Field label="Disposisi Pegawai" required className="sm:col-span-2">
          <Input value={form.disposisiPegawai} onChange={(e) => update('disposisiPegawai', e.target.value)} placeholder="Nama pegawai / disposisi" />
        </Field>
      </div>

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
