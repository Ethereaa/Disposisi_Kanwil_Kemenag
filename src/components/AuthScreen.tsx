import { useState, type FormEvent } from 'react';
import { Lock, Mail, Eye, EyeOff, Users, Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { APP_TITLE, APP_SHORT, type AppUser } from '@/types';
import { loginUser } from '@/lib/storage';

interface AuthScreenProps {
  onAuthed: (user?: AppUser) => void;
}

// Login only — self-service registration was removed on purpose. An
// account grants access to every record in the system (the data policies
// are shared-access), so accounts are provisioned by an admin in the
// Supabase dashboard rather than claimed by whoever finds the URL. See
// the note above updateUsername() in src/lib/storage.ts.
export function AuthScreen({ onAuthed }: AuthScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await loginUser(identifier, password);
      toast('Berhasil login. Selamat datang!', 'success');
      onAuthed(user);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Terjadi kesalahan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.20),_transparent_40%),linear-gradient(135deg,_#f8fcf9,_#eef6f0_50%,_#f5f8ff)] p-4 sm:p-8 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.20),_transparent_40%),linear-gradient(135deg,_#0f172a,_#111827_60%,_#0b1220)]">
      <div className="absolute left-[-5%] top-[-10%] h-56 w-56 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="absolute bottom-[-5%] right-[-5%] h-64 w-64 rounded-full bg-teal-300/25 blur-3xl" />

      <div className="glass-card relative w-full max-w-5xl p-3">
        <div className="grid overflow-hidden rounded-xl lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center brand-gradient-hero p-8 text-white sm:p-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Logo size={44} />
            </div>
            <h1 className="max-w-md text-3xl font-semibold leading-tight sm:text-4xl">{APP_SHORT}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-emerald-50/90 sm:text-base">
              Platform Disposisi & Agenda Pimpinan.
            </p>
            <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <Users size={18} className="text-emerald-100" />
                <p className="text-sm text-emerald-50/90">Kelola Surat Masuk, Surat Keluar, dan Agenda Pimpinan dengan flexibel.</p>
              </div>
            </div>
          </div>

          <div className="bg-white/85 p-6 sm:p-8 dark:bg-slate-900/70">
            <div className="mb-6 flex flex-col items-start gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">Akses sistem</p>
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Masuk ke akun</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email atau Username" required>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
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

              <Field label="Password" required>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="pl-9 pr-9"
                    required
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-emerald-700 dark:text-slate-400 dark:hover:text-slate-200">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? (
                  <><Loader2 size={18} className="animate-spin" /> Memproses...</>
                ) : 'Masuk'}
              </Button>
            </form>

            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <Users size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                Akun dibuat oleh admin. Hubungi admin jika Anda belum memiliki akses.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 flex flex-col items-center gap-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
        <p>{APP_TITLE}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">Created by Luthfi Alfikri for Personal Use Only</p>
      </div>
    </div>
  );
}
