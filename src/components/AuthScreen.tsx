import { useState, type FormEvent } from 'react';
import { LogIn, UserPlus, Lock, Mail, Eye, EyeOff, Users, User, Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { APP_TITLE, APP_SHORT, type AppUser } from '@/types';
import { loginUser, registerUser } from '@/lib/storage';

interface AuthScreenProps {
  onAuthed: (user?: AppUser) => void;
}

type Mode = 'login' | 'register';

export function AuthScreen({ onAuthed }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  function switchMode(next: Mode) {
    setMode(next);
    setIdentifier('');
    setUsername('');
    setEmail('');
    setPassword('');
    setShowPw(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        const user = await loginUser(identifier, password);
        toast('Berhasil login. Selamat datang!', 'success');
        onAuthed(user);
      } else {
        await registerUser(username, email, password);
        toast('Registrasi berhasil, silakan login.', 'success');
        switchMode('login');
        setIdentifier(email.trim());
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Terjadi kesalahan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-blue-50 to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 animate-slide-up">
          <Logo size={72} className="mb-4 shadow-lg" />
          <h1 className="text-center text-xl font-bold text-office-text dark:text-slate-100 leading-snug max-w-sm">
            {APP_SHORT}
          </h1>
          <p className="text-center text-sm text-office-subtext dark:text-slate-400 mt-1 max-w-xs">
            Kelola disposisi surat masuk dan keluar
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-office-border dark:border-slate-700 p-6 animate-scale-in">
          <div className="flex gap-1 p-1 mb-5 bg-slate-100 dark:bg-slate-900 rounded-lg">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${mode === 'login' ? 'bg-white dark:bg-slate-700 text-office-primary dark:text-blue-400 shadow-sm' : 'text-office-subtext dark:text-slate-400'}`}
            >
              <LogIn size={16} /> Masuk
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${mode === 'register' ? 'bg-white dark:bg-slate-700 text-office-primary dark:text-blue-400 shadow-sm' : 'text-office-subtext dark:text-slate-400'}`}
            >
              <UserPlus size={16} /> Daftar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Field label="Username" required>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="nama panggilan"
                    className="pl-9"
                    autoFocus
                    required
                  />
                </div>
              </Field>
            )}

            {mode === 'register' ? (
              <Field label="Email" required>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="pl-9"
                    required
                  />
                </div>
              </Field>
            ) : (
              <Field label="Email atau Username" required>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
                  <Input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="email@contoh.com atau username"
                    className="pl-9"
                    autoFocus
                    required
                  />
                </div>
              </Field>
            )}

            <Field label="Password" required hint={mode === 'register' ? 'Minimal 6 karakter' : undefined}>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400" />
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="pl-9 pr-9"
                  required
                />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-office-subtext dark:text-slate-400 hover:text-office-text dark:hover:text-slate-200">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? (
                <><Loader2 size={18} className="animate-spin" /> Memproses...</>
              ) : mode === 'login' ? 'Masuk' : 'Daftar Sekarang'}
            </Button>
          </form>

          <div className="mt-4 flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-100 dark:border-blue-900/50">
            <Users size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-200">
              {mode === 'register'
                ? 'Setelah daftar, silakan login.'
                : 'Masuk dengan email atau username yang Anda daftarkan.'}
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-office-subtext dark:text-slate-500 leading-relaxed px-4">
          {APP_TITLE}
        </p>
      </div>
    </div>
  );
}
