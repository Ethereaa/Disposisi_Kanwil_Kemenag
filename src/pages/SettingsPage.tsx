import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Moon, Sun, Save, ShieldCheck, RotateCcw, Upload, History, ShieldAlert, BellRing, BellOff, Settings as SettingsIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Surface } from '@/components/ui/Surface';
import { Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { Logo } from '@/components/Logo';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCurrentUser, changePassword, updateUsername } from '@/lib/storage';
import { setCustomLogo, clearCustomLogo, getLogoSrc, getLogoSize, setLogoSize } from '@/lib/logo';
import { formatDateTime } from '@/lib/date';
import { getOverdueThresholdDays, setOverdueThresholdDays } from '@/lib/db';
import {
  isPushSupported,
  getNotificationPermission,
  getExistingSubscription,
  subscribeToAgendaReminders,
  unsubscribeFromAgendaReminders,
} from '@/lib/push';
import type { Theme, AppUser, SuratMasuk, SuratKeluar, AgendaPimpinan } from '@/types';

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onUserUpdated: () => void;
  suratMasuk?: SuratMasuk[];
  suratKeluar?: SuratKeluar[];
  agendaPimpinan?: AgendaPimpinan[];
}

interface ActivityItem {
  id: string;
  label: string;
  by: string;
  at: string;
  kind: 'masuk' | 'keluar' | 'agenda';
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS LAYOUT PRIMITIVES
//
// Settings was six stacked `soft-panel` cards, several of them wrapping a
// second `bg-slate-50 rounded-xl border p-4` box around a single control — so
// every setting arrived at the same visual weight inside two nested frames,
// and the page read as one long undifferentiated stack.
//
// Now: four topic panels, each a `Surface` with a header band and a divided
// list of rows. A row is "what this setting is" on the left, "the control" on
// the right (stacked below `sm:`). Density comes from the dividers, hierarchy
// from the panel headers — no nested cards.
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Surface as="section" className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-office-border px-4 py-3.5 dark:border-slate-700 sm:px-5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-office-primary/10 text-office-primary dark:bg-emerald-500/10 dark:text-emerald-400">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-heading text-office-text dark:text-slate-100">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-office-subtext dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>
      {/* A single-child panel gets no divider line, which is what the activity
          list wants; multi-row panels get one rule between each row. */}
      <div className="divide-y divide-office-border dark:divide-slate-700/60">{children}</div>
    </Surface>
  );
}

function SettingRow({
  /** Set when the row wraps exactly one labellable control: the row title then
   *  becomes that control's real `<label>`, so tapping it focuses the input,
   *  and the hint is published at `${controlId}-hint` for the control to name
   *  in `aria-describedby` — the wiring `Field` gives its own children. */
  controlId,
  label,
  hint,
  required,
  children,
}: {
  controlId?: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  const titleClass = 'block text-body-strong text-office-text dark:text-slate-200';
  const title = required ? (
    <>
      {label}
      <span aria-hidden="true" className="ml-0.5 text-rose-500">
        *
      </span>
    </>
  ) : (
    label
  );

  return (
    <div className="flex flex-col gap-2.5 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0 sm:max-w-[19rem]">
        {controlId ? (
          <label htmlFor={controlId} className={titleClass}>
            {title}
          </label>
        ) : (
          <p className={titleClass}>{title}</p>
        )}
        {hint && (
          <p
            id={controlId ? `${controlId}-hint` : undefined}
            className="mt-0.5 text-xs leading-5 text-office-subtext dark:text-slate-400"
          >
            {hint}
          </p>
        )}
      </div>
      <div className="min-w-0 sm:w-72 sm:shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage({ theme, onToggleTheme, onUserUpdated, suratMasuk = [], suratKeluar = [], agendaPimpinan = [] }: Props) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [usernameEdit, setUsernameEdit] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [busyUsername, setBusyUsername] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [busyPw, setBusyPw] = useState(false);
  const [logoSrc, setLogoSrc] = useState(getLogoSrc());
  const [logoSize, setLogoSizeState] = useState(getLogoSize());
  const [installable, setInstallable] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [reminderSubscribed, setReminderSubscribed] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [overdueThreshold, setOverdueThresholdState] = useState(3);
  const [overdueThresholdInput, setOverdueThresholdInput] = useState('3');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // The overdue threshold is one office-wide value, so changing it changes what
  // every user sees as "terlambat" — and what the overdue reminder notifies
  // about. Reading it stays open to everyone (Dashboard and Surat Masuk both
  // need it to render the badge correctly); only an admin may write it, which
  // is what the app_settings RLS policies now enforce.
  //
  // Exact === 'admin' on purpose. `user` is null until getCurrentUser()
  // resolves, and role is a plain string from profiles, so anything looser
  // (role !== 'staf', a truthy check) would open the control during that first
  // render or for an unrecognised role. This fails closed instead.
  const canManageThreshold = user?.role === 'admin';

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then((sub) => setReminderSubscribed(!!sub));
  }, []);

  useEffect(() => {
    setLogoSrc(getLogoSrc());
    setLogoSizeState(getLogoSize());

    // Chrome/Edge Android only fire 'beforeinstallprompt' once, right after
    // the page loads — usually well before the user ever navigates to
    // Settings. main.tsx already captures that event into
    // window.deferredInstallPrompt, so on mount we must check for it
    // directly instead of only listening for a future event that has
    // likely already fired and will never fire again this session.
    if (window.deferredInstallPrompt) {
      setInstallable(true);
    }

    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setAlreadyInstalled(isStandalone);

    const handleBeforeInstall = () => setInstallable(true);
    const handleAppInstalled = () => {
      setInstallable(false);
      setAlreadyInstalled(true);
      window.deferredInstallPrompt = undefined;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setUsernameEdit(u?.username ?? '');
    });
  }, []);

  useEffect(() => {
    getOverdueThresholdDays()
      .then((days) => {
        setOverdueThresholdState(days);
        setOverdueThresholdInput(String(days));
      })
      .catch(() => {
        // Non-critical — the input just falls back to the component default of 3.
      });
  }, []);

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...suratMasuk.map((s) => ({
        id: `masuk-${s.id}`,
        label: `Surat Masuk No. ${s.nomorUrut} — ${s.perihal || 'tanpa perihal'}`,
        by: s.createdByEmail || 'Tidak diketahui',
        at: s.updatedAt || s.createdAt,
        kind: 'masuk' as const,
      })),
      ...suratKeluar.map((s) => ({
        id: `keluar-${s.id}`,
        label: `Surat Keluar No. ${s.nomorUrut} — ${s.perihal || 'tanpa perihal'}`,
        by: s.createdByEmail || 'Tidak diketahui',
        at: s.updatedAt || s.createdAt,
        kind: 'keluar' as const,
      })),
      ...agendaPimpinan.map((a) => ({
        id: `agenda-${a.id}`,
        label: `Agenda No. ${a.nomorUrut} — ${a.namaKegiatan || 'tanpa nama kegiatan'}`,
        by: a.createdByEmail || 'Tidak diketahui',
        at: a.updatedAt || a.createdAt,
        kind: 'agenda' as const,
      })),
    ];
    return items
      .filter((i) => i.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10);
  }, [suratMasuk, suratKeluar, agendaPimpinan]);

  const kindBadge: Record<ActivityItem['kind'], string> = {
    masuk: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    keluar: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    agenda: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  };
  const kindLabel: Record<ActivityItem['kind'], string> = {
    masuk: 'Surat Masuk',
    keluar: 'Surat Keluar',
    agenda: 'Agenda',
  };

  async function handleUsername(e: FormEvent) {
    e.preventDefault();
    setBusyUsername(true);
    try {
      await updateUsername(usernameEdit);
      const updated = await getCurrentUser();
      setUser(updated);
      setUsernameEdit(updated?.username ?? '');
      setEditingUsername(false);
      toast('Username berhasil diubah.', 'success');
      onUserUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengubah username.', 'error');
    } finally {
      setBusyUsername(false);
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setBusyPw(true);
    try {
      await changePassword(newPw);
      setNewPw('');
      toast('Password berhasil diubah.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengubah password.', 'error');
    } finally {
      setBusyPw(false);
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('File harus berupa gambar (PNG, JPG, atau SVG).', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('Ukuran gambar maksimal 2 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setCustomLogo(dataUrl);
      setLogoSrc(dataUrl);
      toast('Logo berhasil diperbarui.', 'success');
    };
    reader.onerror = () => toast('Gagal memproses gambar.', 'error');
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleResetLogo() {
    clearCustomLogo();
    setLogoSrc(getLogoSrc());
    setLogoSizeState(getLogoSize());
    toast('Logo dikembalikan ke default.', 'info');
  }

  function handleLogoSizeChange(next: number) {
    const normalized = Math.max(24, Math.min(220, next));
    setLogoSizeState(normalized);
    setLogoSize(normalized);
  }

  async function handleInstallApp() {
    const event = window.deferredInstallPrompt as Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | undefined;
    if (!event?.prompt) {
      toast('Instalasi tidak tersedia di browser ini. Di Android, buka lewat Chrome/Edge lalu coba lagi. Di iPhone/iPad, gunakan menu Share → "Add to Home Screen".', 'info');
      return;
    }
    await event.prompt();
    const choice = await event.userChoice;
    window.deferredInstallPrompt = undefined;
    setInstallable(false);
    if (choice?.outcome === 'accepted') {
      setAlreadyInstalled(true);
      toast('Aplikasi berhasil dipasang.', 'success');
    } else {
      toast('Instalasi dibatalkan.', 'info');
    }
  }

  async function handleToggleReminder() {
    setReminderBusy(true);
    try {
      if (reminderSubscribed) {
        await unsubscribeFromAgendaReminders();
        setReminderSubscribed(false);
        toast('Reminder dinonaktifkan di perangkat ini.', 'info');
      } else {
        await subscribeToAgendaReminders();
        setReminderSubscribed(true);
        toast('Reminder diaktifkan. Anda akan diingatkan untuk agenda pimpinan (H-1 & hari-H) dan surat masuk yang terlambat diproses.', 'success');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengubah pengaturan reminder.', 'error');
    } finally {
      setReminderBusy(false);
    }
  }

  async function handleSaveThreshold() {
    // Defence in depth: the Save control is only rendered for an admin, so
    // reaching here without the capability means the gate above regressed.
    // Return silently rather than let the request through — the database would
    // reject it as a bare RLS violation, which is not a useful message.
    if (!canManageThreshold) return;
    const days = Number.parseInt(overdueThresholdInput, 10);
    if (!Number.isFinite(days) || days < 1) {
      toast('Masukkan jumlah hari yang valid (minimal 1).', 'error');
      return;
    }
    setSavingThreshold(true);
    try {
      await setOverdueThresholdDays(days);
      setOverdueThresholdState(days);
      setOverdueThresholdInput(String(days));
      toast('Ambang waktu terlambat disimpan.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan ambang waktu.', 'error');
    } finally {
      setSavingThreshold(false);
    }
  }

  const notifPermission = getNotificationPermission();
  const isCustomLogo = logoSrc !== '/kemenag-seeklogo.svg';
  const readOnlyInput = 'bg-slate-50 dark:bg-slate-900/40';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        icon={SettingsIcon}
        description="Kelola akun, keamanan, tampilan, dan notifikasi aplikasi."
      />

      <SettingsPanel
        icon={ShieldCheck}
        title="Akun & Keamanan"
        description="Identitas Anda di sistem dan kredensial untuk masuk."
      >
        <SettingRow controlId="set-username" label="Username" hint="Nama yang tampil di aplikasi.">
          {editingUsername ? (
            <form onSubmit={handleUsername} className="space-y-2">
              <Input
                id="set-username"
                aria-describedby="set-username-hint"
                type="text"
                value={usernameEdit}
                onChange={(e) => setUsernameEdit(e.target.value)}
                required
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busyUsername} className="flex-1 sm:flex-none">
                  <Save size={14} /> Simpan
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => { setEditingUsername(false); setUsernameEdit(user?.username ?? ''); }}
                >
                  Batal
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              <Input
                id="set-username"
                aria-describedby="set-username-hint"
                value={user?.username ?? ''}
                readOnly
                className={readOnlyInput}
              />
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditingUsername(true)}>
                Ubah
              </Button>
            </div>
          )}
        </SettingRow>

        <SettingRow
          controlId="set-email"
          label="Email"
          hint="Identitas akun Anda dan tidak dapat diubah. Setiap pengguna memiliki email sendiri."
        >
          <Input
            id="set-email"
            aria-describedby="set-email-hint"
            value={user?.email ?? ''}
            readOnly
            className={readOnlyInput}
          />
        </SettingRow>

        {user?.role && (
          <SettingRow label="Peran" hint="Menentukan tindakan yang tersedia untuk Anda.">
            <span
              className={`inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold ${user.role === 'admin' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}
            >
              <ShieldAlert size={13} aria-hidden="true" />
              {user.role === 'admin' ? 'Admin — bisa hapus data' : 'Staf — lihat & input saja'}
            </span>
          </SettingRow>
        )}

        <SettingRow controlId="set-password" label="Password Baru" required hint="Minimal 6 karakter.">
          <form onSubmit={handlePassword} className="space-y-2">
            <Input
              id="set-password"
              aria-describedby="set-password-hint"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Button type="submit" size="sm" disabled={busyPw} className="w-full sm:w-auto">
              <Save size={14} /> {busyPw ? 'Menyimpan...' : 'Ubah Password'}
            </Button>
          </form>
        </SettingRow>
      </SettingsPanel>

      <SettingsPanel icon={Sun} title="Tampilan" description="Tema dan identitas visual aplikasi.">
        <SettingRow
          label="Mode Tampilan"
          hint={`Saat ini: ${theme === 'dark' ? 'Dark Mode' : 'Light Mode'}.`}
        >
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onToggleTheme}>
            {theme === 'dark' ? <><Sun size={15} /> Ganti ke Light</> : <><Moon size={15} /> Ganti ke Dark</>}
          </Button>
        </SettingRow>

        <SettingRow
          label="Logo Aplikasi"
          hint="Tampil di sidebar, halaman login, dan tab browser. PNG/JPG/SVG, maks. 2 MB."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control border border-office-border bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
                <Logo size={Math.max(28, Math.min(52, logoSize))} />
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <Upload size={15} /> Unggah
                </Button>
                {isCustomLogo && (
                  <Button variant="ghost" size="sm" onClick={handleResetLogo}>
                    <RotateCcw size={15} /> Default
                  </Button>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="set-logo-size" className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Ukuran logo
                </label>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{logoSize}px</span>
              </div>
              <input
                id="set-logo-size"
                type="range"
                min="24"
                max="220"
                value={logoSize}
                onChange={(e) => handleLogoSizeChange(Number(e.target.value))}
                className="mt-2 h-6 w-full accent-emerald-600"
              />
            </div>
          </div>
        </SettingRow>
      </SettingsPanel>

      <SettingsPanel
        icon={BellRing}
        title="Notifikasi & Perangkat"
        description="Reminder otomatis, ambang keterlambatan, dan pemasangan aplikasi."
      >
        <SettingRow
          label="Reminder Agenda & Surat Masuk"
          hint={
            <>
              Notifikasi di perangkat ini untuk agenda pimpinan <span className="font-semibold">besok (H-1)</span> dan{' '}
              <span className="font-semibold">hari ini (hari-H)</span>, serta surat masuk yang{' '}
              <span className="font-semibold">terlambat diproses</span>.
            </>
          }
        >
          {notifPermission === 'unsupported' ? (
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Browser ini tidak mendukung notifikasi push. Coba buka lewat Chrome/Edge terbaru.
            </p>
          ) : notifPermission === 'denied' ? (
            <p className="text-xs leading-5 text-rose-600 dark:text-rose-300">
              Izin notifikasi diblokir di browser ini. Aktifkan lewat pengaturan situs (ikon gembok di address bar) lalu
              muat ulang halaman.
            </p>
          ) : (
            <div className="space-y-2">
              <Button
                variant={reminderSubscribed ? 'secondary' : 'primary'}
                size="sm"
                className="w-full sm:w-auto"
                onClick={handleToggleReminder}
                disabled={reminderBusy}
              >
                {reminderSubscribed ? <><BellOff size={15} /> Nonaktifkan</> : <><BellRing size={15} /> Aktifkan</>}
              </Button>
              <p
                className={`text-xs font-medium ${reminderSubscribed ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {reminderSubscribed ? 'Aktif di perangkat ini' : 'Belum aktif di perangkat ini'}
              </p>
            </div>
          )}
        </SettingRow>

        <SettingRow
          controlId={canManageThreshold ? 'set-threshold' : undefined}
          label="Ambang Waktu Terlambat"
          hint='Surat masuk berstatus "Diproses" lebih dari sekian hari kerja (Senin–Jumat) ditandai terlambat di Surat Masuk, Dashboard, dan notifikasi. Berlaku untuk seluruh kantor.'
        >
          {canManageThreshold ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  id="set-threshold"
                  aria-describedby="set-threshold-hint"
                  type="number"
                  min={1}
                  value={overdueThresholdInput}
                  onChange={(e) => setOverdueThresholdInput(e.target.value)}
                  className="w-20 shrink-0"
                />
                <span className="text-body text-office-subtext dark:text-slate-400">hari kerja</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleSaveThreshold}
                disabled={savingThreshold || overdueThresholdInput === String(overdueThreshold)}
              >
                <Save size={14} /> Simpan
              </Button>
            </div>
          ) : (
            /* Staf still sees the value in force — it explains the badges on
               Surat Masuk and the Dashboard — but gets no write control at
               all, rather than a control that fails on save. */
            <div className="space-y-1.5">
              <p className="text-body text-office-text dark:text-slate-100">
                <span className="text-body-strong tabular-nums">{overdueThreshold}</span> hari kerja
              </p>
              <p className="inline-flex items-start gap-1 text-xs text-office-subtext dark:text-slate-400">
                <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                Hanya admin yang dapat mengubah setelan kantor ini.
              </p>
            </div>
          )}
        </SettingRow>

        <SettingRow
          label="Instal Aplikasi"
          hint={
            <>
              Pasang sebagai aplikasi Android (PWA) dengan nama{' '}
              <span className="font-semibold">Agenda Pimpinan Kanwil</span>.
            </>
          }
        >
          {alreadyInstalled ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Aplikasi sudah terpasang di perangkat ini.
            </p>
          ) : (
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={handleInstallApp}
                disabled={!installable}
              >
                {installable ? 'Install Sekarang' : 'Menunggu izin browser…'}
              </Button>
              {!installable && (
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Tombol aktif otomatis begitu Chrome/Edge mengizinkan instalasi. Di iPhone/iPad, pasang lewat menu
                  Share → "Add to Home Screen".
                </p>
              )}
            </div>
          )}
        </SettingRow>
      </SettingsPanel>

      {/* Activity log (simple audit trail from existing createdByEmail data) */}
      <SettingsPanel icon={History} title="Aktivitas Terbaru" description="10 perubahan data terakhir di seluruh kantor.">
        {recentActivity.length === 0 ? (
          <div className="px-4 py-5 sm:px-5">
            <EmptyState icon={History} title="Belum ada aktivitas" description="Aktivitas terbaru akan muncul di sini." compact />
          </div>
        ) : (
          <ul className="divide-y divide-office-border px-4 dark:divide-slate-700/60 sm:px-5">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-body text-office-text dark:text-slate-200">{item.label}</p>
                  <p className="text-xs text-office-subtext dark:text-slate-400">oleh {item.by}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                  <span className={`inline-flex items-center rounded-chip px-2 py-0.5 text-[11px] font-medium ${kindBadge[item.kind]}`}>
                    {kindLabel[item.kind]}
                  </span>
                  <span className="text-[11px] text-office-subtext dark:text-slate-500">{formatDateTime(item.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>

      <p className="pt-1 text-center text-xs text-office-subtext dark:text-slate-500">
        Aplikasi internal Kanwil · Data tersimpan di cloud dan dapat diakses dari mana saja
      </p>
    </div>
  );
}
