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
//
// ─────────────────────────────────────────────────────────────────────────────
// PRESENTATION: deliberately the pre-Big-Root-2 login screen (the version at
// c0b793b^ / 8436bdc), restored by user decision after the Root-2 redesign was
// rejected. Do not "modernise" this file to match the rest of the app: the
// radial-gradient canvas, the two blurred accent blobs, the always-visible
// gradient hero, the translucent glass card and the absolutely-positioned
// footer are all intentional here and intentionally NOT the Root-2 language.
//
// The card styling is written out as local utilities rather than the shared
// `.glass-card` class on purpose. Root-2 redefined `.glass-card` in index.css
// (it now aliases `.surface-overlay`: opaque, no blur, heavier shadow), and
// that class is also used by Modal and Agenda Preview — so reverting it in the
// stylesheet would drag every dialog in the app back with it. These utilities
// reproduce the ORIGINAL `.glass-card` definition, scoped to this screen only.
//
// Auth behaviour is CURRENT, not historical: loginUser, the login-only flow,
// native `required`, autoComplete, the Button `isLoading` contract and the
// show/hide toggle all match the rest of the app today.
// ─────────────────────────────────────────────────────────────────────────────
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
    // Padding is written per axis, not as `p-4 sm:p-8`: the bottom needs its own
    // value on small screens. The footer below is absolutely positioned, so it
    // does not reserve space, and once it wraps to two or three lines on a phone
    // it landed on top of the card. pb-28 is that clearance, and it disappears
    // at sm where the footer is one line again.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.20),_transparent_40%),linear-gradient(135deg,_#f8fcf9,_#eef6f0_50%,_#f5f8ff)] px-4 pb-28 pt-6 sm:px-8 sm:py-8 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.20),_transparent_40%),linear-gradient(135deg,_#0f172a,_#111827_60%,_#0b1220)]">
      <div className="absolute left-[-5%] top-[-10%] h-56 w-56 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="absolute bottom-[-5%] right-[-5%] h-64 w-64 rounded-full bg-teal-300/25 blur-3xl" />

      {/* The original `.glass-card`, inlined — see the note above the component. */}
      <div className="relative w-full max-w-5xl rounded-2xl border border-white/70 bg-white/70 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-800/70 sm:p-3">
        <div className="grid overflow-hidden rounded-xl lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center brand-gradient-hero p-6 text-white sm:p-10">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur sm:mb-6">
              <Logo size={44} />
            </div>
            {/* The ramp ends where the two-column grid begins, so the desktop
                hero keeps its original 36px heading; the smaller steps below
                only apply while the hero spans the full width of a phone or
                tablet, where 36px broke APP_SHORT across four lines. */}
            <h1 className="max-w-md break-words text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">{APP_SHORT}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-emerald-50/90 sm:text-base">
              Platform Disposisi &amp; Agenda Pimpinan.
            </p>
            <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur sm:mt-8">
              <div className="flex items-center gap-3">
                <Users size={18} className="shrink-0 text-emerald-100" aria-hidden="true" />
                <p className="min-w-0 text-sm text-emerald-50/90">Kelola Surat Masuk, Surat Keluar, dan Agenda Pimpinan dengan flexibel.</p>
              </div>
            </div>
          </div>

          <div className="bg-white/85 p-5 sm:p-8 dark:bg-slate-900/70">
            <div className="mb-6 flex flex-col items-start gap-2">
              {/* 0.24em of tracking on 14px is ~40px of pure letter-spacing
                  across two words; at 320px that was the widest thing on the
                  panel. Both the size and the tracking relax below sm. */}
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 sm:text-sm sm:tracking-[0.24em]">Akses sistem</p>
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 sm:text-2xl">Masuk ke akun</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email atau Username" required>
                <div className="relative">
                  <Mail size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
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
                  <Lock size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="pl-9 pr-9"
                    autoComplete="current-password"
                    required
                  />
                  {/* Original position and hitbox. `aria-label`/`aria-pressed` are
                      kept from the current version: they are invisible, so they
                      cost nothing against the pre-Root-2 look, and dropping them
                      would leave the toggle unnamed for a screen reader. */}
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPw}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-emerald-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </Field>

              <Button type="submit" size="lg" className="w-full" isLoading={busy}>
                {busy ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>

            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <Users size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                Akun dibuat oleh admin. Hubungi admin jika Anda belum memiliki akses.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Still absolutely positioned, per the presentation note above — but
          pinned to both edges and capped instead of sizing itself. Left as
          `absolute bottom-4` alone it took its width from its static position,
          so on a phone the 76-character APP_TITLE either spilled past the
          container — which is overflow-hidden, so the tail was simply cut off —
          or collapsed into a narrow ragged column in the middle of the screen.
          max-w-2xl is wide enough that the desktop rendering stays on one line. */}
      <div className="absolute inset-x-0 bottom-4 mx-auto flex max-w-2xl flex-col items-center gap-1 px-6 text-center text-[11px] leading-4 text-slate-500 dark:text-slate-400 sm:px-4">
        <p className="break-words">{APP_TITLE}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">Created by Luthfi Alfikri for Personal Use Only</p>
      </div>
    </div>
  );
}
