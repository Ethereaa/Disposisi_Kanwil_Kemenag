import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Mail, Lock, Moon, Sun, Save, ShieldCheck, RotateCcw, Upload, User, Smartphone, History, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { Logo } from '@/components/Logo';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCurrentUser, changePassword, updateUsername } from '@/lib/storage';
import { setCustomLogo, clearCustomLogo, getLogoSrc, getLogoSize, setLogoSize } from '@/lib/logo';
import { formatDateTime } from '@/lib/date';
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-[24px] border border-emerald-100/80 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Kelola akun, keamanan, dan tampilan aplikasi dengan nuansa yang lebih modern.</p>
      </div>

      {/* Account info */}
      <section className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200 flex items-center gap-2">
          <Mail size={16} className="text-office-primary" /> Akun
        </h3>
        <Field label="Username">
          {editingUsername ? (
            <form onSubmit={handleUsername} className="flex gap-2">
              <div className="relative flex-1">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
                <Input
                  type="text"
                  value={usernameEdit}
                  onChange={(e) => setUsernameEdit(e.target.value)}
                  className="pl-9"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" size="sm" disabled={busyUsername}>
                <Save size={14} /> Simpan
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => { setEditingUsername(false); setUsernameEdit(user?.username ?? ''); }}>
                Batal
              </Button>
            </form>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
                <Input value={user?.username ?? ''} readOnly className="pl-9 bg-slate-50 dark:bg-slate-900/40" />
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditingUsername(true)}>
                <User size={14} /> Ubah
              </Button>
            </div>
          )}
        </Field>
        <Field label="Email">
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
            <Input value={user?.email ?? ''} readOnly className="pl-9 bg-slate-50 dark:bg-slate-900/40" />
          </div>
        </Field>
        <p className="text-xs text-office-subtext dark:text-slate-400">
          Email adalah identitas akun Anda dan tidak dapat diubah. Setiap anggota keluarga memiliki akun dengan email sendiri.
        </p>
        {user?.role && (
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-office-subtext dark:text-slate-400" />
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${user.role === 'admin' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'}`}>
              {user.role === 'admin' ? 'Admin — bisa hapus data' : 'Staf — lihat & input saja'}
            </span>
          </div>
        )}
      </section>

      {/* Appearance */}
      <section className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200 flex items-center gap-2">
          <Sun size={16} className="text-amber-500" /> Tampilan
        </h3>

        {/* Logo customization */}
        <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-office-border dark:border-slate-700">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex items-center gap-3">
              <Logo size={Math.max(48, Math.min(96, logoSize))} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-office-text dark:text-slate-200">Logo Aplikasi</p>
                <p className="text-xs text-office-subtext dark:text-slate-400">Tampil di sidebar, halaman login, dan tab browser. PNG/JPG/SVG, maks. 2 MB.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoChange} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                <Upload size={15} /> Unggah
              </Button>
              {logoSrc !== '/kemenag-seeklogo.svg' && (
                <Button variant="ghost" size="sm" onClick={handleResetLogo}>
                  <RotateCcw size={15} /> Default
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:max-w-xs">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ukuran Logo (px)</label>
            <input
              type="range"
              min="24"
              max="220"
              value={logoSize}
              onChange={(e) => handleLogoSizeChange(Number(e.target.value))}
              className="accent-emerald-600"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Ukuran saat ini: {logoSize}px</p>
          </div>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-office-border dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-office-primary/10 flex items-center justify-center">
              {theme === 'dark' ? <Moon size={18} className="text-office-primary" /> : <Sun size={18} className="text-amber-500" />}
            </div>
            <div>
              <p className="text-sm font-medium text-office-text dark:text-slate-200">Mode Tampilan</p>
              <p className="text-xs text-office-subtext dark:text-slate-400">Saat ini: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleTheme}>
            {theme === 'dark' ? <><Sun size={15} /> Light</> : <><Moon size={15} /> Dark</>}
          </Button>
        </div>
      </section>

      {/* PWA */}
      <section className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200 flex items-center gap-2">
          <Smartphone size={16} className="text-emerald-600" /> Instal Aplikasi Android
        </h3>
        <div className="rounded-xl border border-emerald-100/70 bg-emerald-50/70 p-4 dark:border-slate-700 dark:bg-emerald-950/20">
          <p className="text-sm text-slate-700 dark:text-slate-200">Pasang aplikasi ini sebagai PWA agar tampil seperti aplikasi Android dengan nama <span className="font-semibold">Agenda Pimpinan Kanwil</span>.</p>
          {alreadyInstalled ? (
            <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">Aplikasi sudah terpasang di perangkat ini.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={handleInstallApp} disabled={!installable}>
                <Smartphone size={15} /> {installable ? 'Install Sekarang' : 'Menunggu izin browser…'}
              </Button>
              {!installable && (
                <p className="w-full text-xs text-slate-500 dark:text-slate-400">
                  Tombol aktif otomatis begitu Chrome/Edge mengizinkan instalasi (biasanya setelah beberapa kali buka & login). Di iPhone/iPad, pasang lewat menu Share → "Add to Home Screen".
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Activity log (simple audit trail from existing createdByEmail data) */}
      <section className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200 flex items-center gap-2">
          <History size={16} className="text-office-primary" /> Aktivitas Terbaru
        </h3>
        {recentActivity.length === 0 ? (
          <EmptyState icon={History} title="Belum ada aktivitas" description="Aktivitas terbaru akan muncul di sini." compact />
        ) : (
          <ul className="divide-y divide-office-border dark:divide-slate-700/60">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-office-text dark:text-slate-200">{item.label}</p>
                  <p className="text-xs text-office-subtext dark:text-slate-400">oleh {item.by}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${kindBadge[item.kind]}`}>
                    {kindLabel[item.kind]}
                  </span>
                  <span className="text-[11px] text-office-subtext dark:text-slate-500">{formatDateTime(item.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Password */}
      <section className="rounded-[24px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 space-y-4">
        <h3 className="text-sm font-semibold text-office-text dark:text-slate-200 flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600" /> Keamanan
        </h3>
        <form onSubmit={handlePassword} className="space-y-4">
          <Field label="Password Baru" required hint="Minimal 6 karakter">
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="pl-9" required />
            </div>
          </Field>
          <Button type="submit" disabled={busyPw}>
            <Save size={16} /> {busyPw ? 'Menyimpan...' : 'Ubah Password'}
          </Button>
        </form>
      </section>

      <p className="text-xs text-office-subtext dark:text-slate-500 text-center pt-2">
        Aplikasi keluarga · Data tersimpan di cloud dan dapat diakses dari mana saja
      </p>
    </div>
  );
}
