import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, Plus, X, Zap, Repeat, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select, FormSection, FormErrorSummary, FormActions } from '@/components/ui/Form';
import { AttachmentField } from '@/components/ui/AttachmentField';
import { useToast } from '@/components/ui/Toast';
import {
  TUJUAN_DISPOSISI,
  SUB_DISPOSISI,
  type SuratMasuk,
  type TujuanDisposisi,
  type SubDisposisi,
  type Attachment,
} from '@/types';
import { todayISO } from '@/lib/date';
import {
  insertMasukSorted,
  updateMasuk,
  updateLampiran,
  getNextNomorUrut,
  suratMasukStore,
  checkNomorSuratDuplicate,
  checkNomorAgendaDuplicate,
} from '@/lib/db';
import { getAttachmentUrl } from '@/lib/attachments';
import { extractTextFromAttachmentFile, parseSuratFields } from '@/lib/ocr';
import { getErrorMessage } from '@/lib/error';
import { useInputMode } from '@/lib/useInputMode';
import { useDebounce } from '@/lib/useDebounce';
import { useFieldRefs } from '@/lib/useFieldRefs';

interface Props {
  editing?: SuratMasuk | null;
  onSaved: (stay: boolean) => void;
  onCancel: () => void;
}

const emptyForm = {
  nomorSurat: '',
  nomorAgenda: '',
  tanggalSurat: '',
  pengirim: '',
  tanggalDiterima: '',
  perihal: '',
  tujuanDisposisi: '' as TujuanDisposisi | '',
  subDisposisi: '' as SubDisposisi | '',
  isiDisposisi: '',
  keterangan: '',
  lampiran: [] as Attachment[],
};

export function SuratMasukForm({ editing, onSaved, onCancel }: Props) {
  const { mode, setMode } = useInputMode();
  const [nomorUrut, setNomorUrut] = useState<number>(1);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dupNomorSurat, setDupNomorSurat] = useState<number | null>(null);
  const [dupNomorAgenda, setDupNomorAgenda] = useState<number | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const nomorSuratRef = useRef<HTMLInputElement>(null);
  // Validated controls, so a failed submit can put the cursor on the first
  // field that actually needs attention instead of only colouring it.
  const { register, focusField } = useFieldRefs();
  const { toast } = useToast();

  // OCR-reads the first lampiran (assumed to be page 1 of the letter) and
  // prefills Nomor Surat / Tanggal Surat from it — an explicit, on-demand
  // action since OCR is heavy on the client (see lib/ocr.ts).
  async function handleAutoFillFromScan() {
    const first = form.lampiran[0];
    if (!first) {
      toast('Upload lampiran terlebih dahulu.', 'error');
      return;
    }
    setOcrBusy(true);
    try {
      const url = await getAttachmentUrl(first.path);
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], first.name, { type: first.type });
      const text = await extractTextFromAttachmentFile(file);
      const parsed = parseSuratFields(text);
      if (!parsed.nomorSurat && !parsed.tanggalISO) {
        toast('Nomor surat/tanggal tidak terbaca dari lampiran. Isi manual ya.', 'error');
      } else {
        setForm((f) => ({
          ...f,
          nomorSurat: parsed.nomorSurat ?? f.nomorSurat,
          tanggalSurat: parsed.tanggalISO ?? f.tanggalSurat,
        }));
        toast('Nomor surat/tanggal terisi otomatis — silakan periksa kembali.', 'success');
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Gagal membaca teks dari lampiran.'), 'error');
    } finally {
      setOcrBusy(false);
    }
  }

  const debouncedNomorSurat = useDebounce(form.nomorSurat, 400);
  const debouncedNomorAgenda = useDebounce(form.nomorAgenda, 400);

  // Light pre-submit check: warn (don't block) if this Nomor Surat is
  // already used by another surat masuk row — catches accidental
  // double-entry before it only surfaces later in a report.
  useEffect(() => {
    let cancelled = false;
    checkNomorSuratDuplicate('surat_masuk', debouncedNomorSurat, editing?.id).then((match) => {
      if (!cancelled) setDupNomorSurat(match ? match.nomorUrut : null);
    }).catch(() => { /* best-effort check; ignore errors */ });
    return () => { cancelled = true; };
  }, [debouncedNomorSurat, editing?.id]);

  useEffect(() => {
    let cancelled = false;
    checkNomorAgendaDuplicate(debouncedNomorAgenda, editing?.id).then((match) => {
      if (!cancelled) setDupNomorAgenda(match ? match.nomorUrut : null);
    }).catch(() => { /* best-effort check; ignore errors */ });
    return () => { cancelled = true; };
  }, [debouncedNomorAgenda, editing?.id]);

  useEffect(() => {
    if (editing) {
      setNomorUrut(editing.nomorUrut);
      setForm({
        nomorSurat: editing.nomorSurat,
        nomorAgenda: editing.nomorAgenda,
        tanggalSurat: editing.tanggalSurat ?? '',
        pengirim: editing.pengirim,
        tanggalDiterima: editing.tanggalDiterima ?? '',
        perihal: editing.perihal,
        tujuanDisposisi: editing.tujuanDisposisi,
        subDisposisi: editing.subDisposisi || ('' as SubDisposisi),
        isiDisposisi: editing.isiDisposisi,
        keterangan: editing.keterangan,
        lampiran: editing.lampiran ?? [],
      });
    } else {
      (async () => {
        setNomorUrut(await getNextNomorUrut(suratMasukStore));
        const today = todayISO();
        setForm((f) => ({ ...f, tanggalDiterima: today, tanggalSurat: today }));
      })();
    }
  }, [editing]);

  // Focus nomor surat when entering "banyak" mode fresh form
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
    if (!form.tanggalDiterima) e.tanggalDiterima = 'Tanggal diterima wajib diisi';
    if (!form.tujuanDisposisi) e.tujuanDisposisi = 'Tujuan disposisi wajib dipilih';
    if (form.tujuanDisposisi === 'Kabag TU' && !form.subDisposisi) {
      e.subDisposisi = 'Sub disposisi wajib dipilih untuk Kabag TU';
    }
    setErrors(e);
    const firstInvalid = Object.keys(e)[0];
    if (firstInvalid) focusField(firstInvalid);
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
        nomorAgenda: form.nomorAgenda.trim(),
        tanggalSurat: form.tanggalSurat,
        pengirim: form.pengirim.trim(),
        tanggalDiterima: form.tanggalDiterima,
        perihal: form.perihal.trim(),
        tujuanDisposisi: form.tujuanDisposisi as TujuanDisposisi,
        subDisposisi: form.tujuanDisposisi === 'Kabag TU' ? (form.subDisposisi as SubDisposisi) : null,
        isiDisposisi: form.isiDisposisi.trim(),
        keterangan: form.keterangan.trim(),
        lampiran: form.lampiran,
      };
      if (editing) {
        await updateMasuk(editing.id, payload);
      } else {
        const inserted = await insertMasukSorted(payload);
        // insert_surat_masuk_sorted() doesn't take lampiran, so attachments
        // picked before the row existed are attached right after.
        if (form.lampiran.length > 0) {
          await updateLampiran('surat_masuk', inserted.id, form.lampiran);
        }
      }

      if (stay && !editing) {
        toast('Data berhasil disimpan. Silakan input surat berikutnya.', 'success');
        const next = await getNextNomorUrut(suratMasukStore);
        setNomorUrut(next);
        setForm({ ...emptyForm, tanggalDiterima: todayISO(), tanggalSurat: todayISO() });
        setErrors({});
        setDupNomorSurat(null);
        setDupNomorAgenda(null);
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

  const isKabagTU = form.tujuanDisposisi === 'Kabag TU';
  const fieldErrors = Object.entries(errors)
    .filter(([, message]) => !!message)
    .map(([key, message]) => ({ key, message }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header info */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-office-border dark:border-slate-700">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-office-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-office-primary tabular-nums">{nomorUrut}</span>
          </div>
          <div>
            <p className="text-xs text-office-subtext dark:text-slate-400">Nomor Urut (otomatis)</p>
            <p className="text-sm font-semibold text-office-text dark:text-slate-200">Surat Masuk</p>
          </div>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-2 text-sm text-office-subtext dark:text-slate-400">
              <Zap size={15} className="text-amber-500" aria-hidden="true" /> Mode Input
            </div>
            <div role="group" aria-label="Mode input" className="flex gap-1 p-1 bg-white dark:bg-slate-800 rounded-lg border border-office-border dark:border-slate-600">
              <button
                type="button"
                onClick={() => setMode('solo')}
                aria-pressed={mode === 'solo'}
                className={`focus-ring min-h-11 rounded-md px-4 text-xs font-medium transition-all sm:min-h-8 ${mode === 'solo' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
              >
                Solo
              </button>
              <button
                type="button"
                onClick={() => setMode('banyak')}
                aria-pressed={mode === 'banyak'}
                className={`focus-ring flex min-h-11 items-center gap-1 rounded-md px-4 text-xs font-medium transition-all sm:min-h-8 ${mode === 'banyak' ? 'bg-office-primary text-white' : 'text-office-subtext dark:text-slate-400'}`}
              >
                <Repeat size={12} aria-hidden="true" /> Banyak
              </button>
            </div>
          </div>
        )}
      </div>

      <FormErrorSummary errors={fieldErrors} onJump={focusField} />

      <FormSection title="Identitas Surat" hint="Nomor & tanggal sesuai surat fisik">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nomor Surat"
            warning={dupNomorSurat != null ? `Nomor surat ini sudah dipakai di No. Urut ${dupNomorSurat}` : undefined}
          >
            <Input
              ref={nomorSuratRef}
              value={form.nomorSurat}
              onChange={(e) => update('nomorSurat', e.target.value)}
              placeholder="cth: 001/ABC/2025"
            />
          </Field>
          <Field
            label="Nomor Agenda"
            hint="Diisi manual, tidak otomatis"
            warning={dupNomorAgenda != null ? `Nomor agenda ini sudah dipakai di No. Urut ${dupNomorAgenda}` : undefined}
          >
            <Input
              value={form.nomorAgenda}
              onChange={(e) => update('nomorAgenda', e.target.value)}
              placeholder="cth: AG-001"
            />
          </Field>
          <Field label="Tanggal Surat" required error={errors.tanggalSurat}>
            <Input
              ref={register('tanggalSurat')}
              type="date"
              value={form.tanggalSurat}
              onChange={(e) => update('tanggalSurat', e.target.value)}
            />
          </Field>
          <Field label="Tanggal Diterima" required error={errors.tanggalDiterima}>
            <Input
              ref={register('tanggalDiterima')}
              type="date"
              value={form.tanggalDiterima}
              onChange={(e) => update('tanggalDiterima', e.target.value)}
            />
          </Field>
          <Field label="Pengirim Surat">
            <Input
              value={form.pengirim}
              onChange={(e) => update('pengirim', e.target.value)}
              placeholder="Instansi/perorangan pengirim"
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
      </FormSection>

      <FormSection title="Disposisi">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tujuan Disposisi" required error={errors.tujuanDisposisi}>
            <Select
              ref={register('tujuanDisposisi')}
              value={form.tujuanDisposisi}
              onChange={(e) => update('tujuanDisposisi', e.target.value as TujuanDisposisi | '')}
              placeholder="-- Pilih Tujuan --"
              options={TUJUAN_DISPOSISI.map((t) => ({ value: t, label: t }))}
            />
          </Field>
          {isKabagTU && (
            <Field label="Sub Disposisi (Kabag TU)" required={isKabagTU} error={errors.subDisposisi}>
              <Select
                ref={register('subDisposisi')}
                value={form.subDisposisi}
                onChange={(e) => update('subDisposisi', e.target.value as SubDisposisi | '')}
                placeholder="-- Pilih Sub --"
                options={SUB_DISPOSISI.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          )}
        </div>
        <Field label="Isi Disposisi">
          <Textarea
            value={form.isiDisposisi}
            onChange={(e) => update('isiDisposisi', e.target.value)}
            placeholder="Isi disposisi surat..."
            rows={3}
          />
        </Field>
      </FormSection>

      <FormSection title="Catatan & Lampiran">
        <Field label="Keterangan">
          <Textarea
            value={form.keterangan}
            onChange={(e) => update('keterangan', e.target.value)}
            placeholder="Keterangan tambahan..."
            rows={2}
          />
        </Field>

        <Field label="Lampiran / Scan Surat Asli" asGroup>
          <AttachmentField
            folder="surat-masuk"
            value={form.lampiran}
            onChange={(next) => update('lampiran', next)}
            disabled={busy}
          />
        </Field>

        {/* OCR assist. Previously passed as the Field's `hint`, which put an
            interactive control inside the text that `aria-describedby` points
            at — read out as part of the field's description instead of being
            reachable as an action. It is its own row now. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-office-border bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-900/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={ocrBusy}
            disabled={busy || form.lampiran.length === 0}
            onClick={handleAutoFillFromScan}
          >
            {!ocrBusy && <FileSearch size={14} aria-hidden="true" />}
            {ocrBusy ? 'Membaca...' : 'Baca Otomatis dari Foto'}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-office-subtext dark:text-slate-400">
            Mengisi Nomor Surat &amp; Tanggal Surat dari lampiran pertama.
            {form.lampiran.length === 0 && ' Upload lampiran dulu untuk memakainya.'}
          </p>
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
