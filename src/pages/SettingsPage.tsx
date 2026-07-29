import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, Lock, Moon, Sun, Save, ShieldCheck, RotateCcw, Upload, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { Logo } from '@/components/Logo';
import { getCurrentUser, changePassword, updateUsername } from '@/lib/storage';
import { setCustomLogo, clearCustomLogo, getLogoSrc, getLogoSize, setLogoSize } from '@/lib/logo';
import type { Theme, AppUser } from '@/types';

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onUserUpdated: () => void;
}

export function SettingsPage({ theme, onToggleTheme, onUserUpdated }: Props) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [usernameEdit, setUsernameEdit] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [busyUsername, setBusyUsername] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [busyPw, setBusyPw] = useState(false);
  const [logoSrc, setLogoSrc] = useState(getLogoSrc());
  const [logoSize, setLogoSizeState] = useState(getLogoSize());
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setLogoSrc(getLogoSrc());
    setLogoSizeState(getLogoSize());
  }, []);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setUsernameEdit(u?.username ?? '');
    });
  }, []);

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
              {logoSrc !== '/kemenag.svg' && (
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
