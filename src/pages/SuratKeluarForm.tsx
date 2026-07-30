import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, Plus, X, Zap, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Checkbox } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { SuratKeluar } from '@/types';
import { displayToISO, isoToDisplay, todayISO } from '@/lib/date';
import {
  insertKeluarSorted,
  updateKeluar,
  getNextNomorUrut,
  suratKeluarStore,
  checkNomorSuratDuplicate,
} from '@/lib/db';
import { getErrorMessage } from '@/lib/error';
import { useInputMode } from '@/lib/useInputMode';
import { useDebounce } from '@/lib/useDebounce';

interface Props {
  editing?: SuratKeluar | null;
  onSaved: (stay: boolean) => void;
  onCancel: () => void;
}

const emptyForm = {
  nomorSurat: '',
  tanggalSurat: '',
  pengirim: '',
  perihal: '',
  ditandatangani: false,
  keterangan: '',
};

export function SuratKeluarForm({ editing, onSaved, onCancel }: Props) {
  const { mode, setMode } = useInputMode();
  const [nomorUrut, setNomorUrut] = useState<number>(1);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dupNomorSurat, setDupNomorSurat] = useState<number | null>(null);
  const nomorSuratRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const debouncedNomorSurat = useDebounce(form.nomorSurat, 400);

  // Light pre-submit check: warn (don't block) if this Nomor Surat is
  // already used by another surat keluar row — catches accidental
  // double-entry before it only surfaces later in a report.
  useEffect(() => {
    let cancelled = false;
    checkNomorSuratDuplicate('surat_keluar', debouncedNomorSurat, editing?.id).then((match) => {
      if (!cancelled) setDupNomorSurat(match ? match.nomorUrut : null);
    }).catch(() => { /* best-effort check; ignore errors */ });
    return () => { cancelled = true; };
  }, [debouncedNomorSurat, editing?.id]);

  useEffect(() => {
    if (editing) {
      setNomorUrut(editing.nomorUrut);
      setForm({
        nomorSurat: editing.nomorSurat,
        tanggalSurat: editing.tanggalSurat ?? '',
        pengirim: editing.pengirim,
        perihal: editing.perihal,
        ditandatangani: editing.ditandatangani,
        keterangan: editing.keterangan,
      });
    } else {
      (async () => {
        setNomorUrut(await getNextNomorUrut(suratKeluarStore));
        setForm((f) => ({ ...f, tanggalSurat: todayISO() }));
      })();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing && mode === 'banyak') {
      const t = setTimeout(() => nomorSuratRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [mode, nomorUrut, editing]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.tanggalSurat) e.tanggalSurat = 'Tanggal surat wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(stay: boolean) {
    if (!validate()) {
      toast('Lengkapi data yang wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        nomorUrut,
        nomorSurat: form.nomorSurat.trim(),
        tanggalSurat: form.tanggalSurat,
        pengirim: form.pengirim.trim(),
        perihal: form.perihal.trim(),
        ditandatangani: form.ditandatangani,
        keterangan: form.keterangan.trim(),
      };
      if (editing) {
        await updateKeluar(editing.id, payload);
      } else {
        await insertKeluarSorted(payload);
      }

      if (stay && !editing) {
        toast('Data berhasil disimpan. Silakan input surat berikutnya.', 'success');
        const next = await getNextNomorUrut(suratKeluarStore);
        setNomorUrut(next);
        setForm({ ...emptyForm, tanggalSurat: todayISO() });
        setErrors({});
        setDupNomorSurat(null);
        setTimeout(() => nomorSuratRef.current?.focus(), 50);
      } else {
        toast('Data berhasil disimpan.', 'success');
        onSaved(false);
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal menyimpan data.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const stay = mode === 'banyak' && !editing;
    save(stay);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-office-border dark:border-slate-700">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-600/10 flex items-center justify-center">
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{nomorUrut}</span>
          </div>
          <div>
            <p className="text-xs text-office-subtext dark:text-slate-400">Nomor Urut (otomatis)</p>
            <p className="text-sm font-semibold text-office-text dark:text-slate-200">Surat Keluar</p>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-office-subtext dark:text-slate-400">
              <Zap size={15} className="text-amber-500" /> Mode Input
            </div>
            <div className="flex gap-1 p-1 bg-white dark:bg-slate-800 rounded-lg border border-office-border dark:border-slate-600">
              <button
                type="button"
                onClick={() => setMode('solo')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'solo' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
              >
                Solo
              </button>
              <button
                type="button"
                onClick={() => setMode('banyak')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${mode === 'banyak' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
              >
                <Repeat size={12} /> Banyak
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="Nomor Surat"
          hint="Opsional"
          warning={dupNomorSurat != null ? `Nomor surat ini sudah dipakai di No. Urut ${dupNomorSurat}` : undefined}
        >
          <Input
            ref={nomorSuratRef}
            value={form.nomorSurat}
            onChange={(e) => update('nomorSurat', e.target.value)}
            placeholder="cth: 002/XYZ/2025"
          />
        </Field>
        <Field label="Tanggal Surat" required error={errors.tanggalSurat}>
          <Input
            type="date"
            value={form.tanggalSurat}
            onChange={(e) => update('tanggalSurat', e.target.value)}
          />
        </Field>
        <Field label="Pengirim Surat">
          <Input
            value={form.pengirim}
            onChange={(e) => update('pengirim', e.target.value)}
            placeholder="Pengirim surat"
          />
        </Field>
        <Field label="Perihal Surat">
          <Input
            value={form.perihal}
            onChange={(e) => update('perihal', e.target.value)}
            placeholder="Perihal surat"
          />
        </Field>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-office-border dark:border-slate-700">
        <Checkbox
          label="Sudah Ditandatangani"
          checked={form.ditandatangani}
          onChange={(v) => update('ditandatangani', v)}
        />
        <p className="text-xs text-office-subtext dark:text-slate-400 mt-1.5">
          Centang jika surat sudah ditandatangani. Jika tidak dicentang, status "Belum Ditandatangani".
        </p>
      </div>

      <Field label="Keterangan">
        <Textarea
          value={form.keterangan}
          onChange={(e) => update('keterangan', e.target.value)}
          placeholder="Keterangan tambahan..."
          rows={3}
        />
      </Field>

      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-office-border dark:border-slate-700">
        <Button type="submit" disabled={busy}>
          <Save size={16} /> {busy ? 'Menyimpan...' : 'Simpan'}
        </Button>
        {!editing && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => save(true)}>
            <Plus size={16} /> Simpan & Input Berikutnya
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          <X size={16} /> Batal
        </Button>
      </div>
    </form>
  );
}
