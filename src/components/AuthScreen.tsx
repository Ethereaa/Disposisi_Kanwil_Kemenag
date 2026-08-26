import { useState, type FormEvent } from 'react';
import { Lock, Mail, Eye, EyeOff, Users } from 'lucide-react';
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
    // Column flow, not an absolutely-positioned footer over a centred card.
    // At 360px the old layout stacked a 300px-tall gradient hero above the
    // form and then floated the credits on top of it, so the first thing a
    // phone user saw was branding and the password field could sit under the
    // footer. The hero is now desktop-only and the footer is in flow.
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center gap-6 p-4 py-8 sm:p-8">
      <div className="glass-card w-full max-w-md p-2 lg:max-w-5xl lg:p-3">
        <div className="grid overflow-hidden rounded-xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="brand-gradient-hero hidden flex-col justify-center p-10 text-white lg:flex">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Logo size={44} />
            </div>
            <h1 className="max-w-md text-4xl font-semibold leading-tight">{APP_SHORT}</h1>
            {/* The one sanctioned use of the restricted gold accent: a
                hairline institutional rule on the hero. Not a button, not a
                card, not body text. */}
            <div className="accent-rule-gold mt-4 h-px w-24" />
            <p className="mt-3 max-w-md text-base leading-6 text-emerald-50/90">
              Platform Disposisi & Agenda Pimpinan.
            </p>
            <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <Users size={18} className="text-emerald-100" aria-hidden="true" />
                <p className="text-sm text-emerald-50/90">Kelola Surat Masuk, Surat Keluar, dan Agenda Pimpinan dengan flexibel.</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 sm:p-7 lg:p-8 dark:bg-slate-900">
            {/* Mobile/tablet brand line. Carries the logo and product name in
                one row so the form itself stays above the fold at 360px. It is
                the <h1> below `lg:`, where the hero (and its own <h1>) is
                display:none and therefore not exposed to a screen reader —
                exactly one heading is live at any breakpoint. */}
            <div className="mb-5 flex items-center gap-3 border-b border-office-border pb-4 dark:border-slate-700 lg:hidden">
              <Logo size={40} />
              <div className="min-w-0">
                <h1 className="truncate text-heading text-slate-800 dark:text-slate-100">{APP_SHORT}</h1>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">Platform Disposisi &amp; Agenda Pimpinan</p>
              </div>
            </div>

            <div className="mb-5 flex flex-col items-start gap-1.5">
              <p className="text-label uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Akses sistem</p>
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Masuk ke akun</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email atau Username" required>
                <div className="relative">
                  <Mail
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
                  />
                  <Input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="email@contoh.com atau username"
                    className="pl-9"
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
              </Field>

              <Field label="Password" required>
                <div className="relative">
                  <Lock
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
                  />
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="pl-9 pr-12 sm:pr-11"
                    autoComplete="current-password"
                    required
                  />
                  {/* 40px square on touch — the reveal toggle was a bare 16px
                      icon, the smallest target on the login screen. */}
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPw}
                    className="focus-ring absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-chip text-slate-500 transition-colors hover:text-emerald-700 sm:h-9 sm:w-9 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Button type="submit" size="lg" className="w-full" isLoading={busy}>
                {busy ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>

            <div className="mt-5 flex items-start gap-2 rounded-control border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <Users size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                Akun dibuat oleh admin. Hubungi admin jika Anda belum memiliki akses.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* text-micro replaces the arbitrary text-[11px]/text-[10px] pair.
          font-normal + tracking-normal hold the rendered weight and tracking
          exactly where they were — the token is the source of the size, not a
          restyle of the footer. */}
      <div className="flex shrink-0 flex-col items-center gap-1 text-center text-micro font-normal tracking-normal text-slate-500 dark:text-slate-400">
        <p>{APP_TITLE}</p>
        <p className="text-slate-400 dark:text-slate-500">Dikembangkan oleh Luthfi Alfikri</p>
      </div>
    </div>
  );
}
