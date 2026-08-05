import type { Theme, InputMode, AppUser } from '@/types';
import { supabase } from './supabase';

const KEYS = {
  theme: 'disposisi-theme',
  inputMode: 'disposisi-input-mode',
  sidebar: 'disposisi-sidebar-open',
};

export function getTheme(): Theme {
  const t = localStorage.getItem(KEYS.theme);
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEYS.theme, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function getInputMode(): InputMode {
  return localStorage.getItem(KEYS.inputMode) === 'banyak' ? 'banyak' : 'solo';
}

export function setInputMode(mode: InputMode): void {
  localStorage.setItem(KEYS.inputMode, mode);
}

export function getSidebarOpen(): boolean {
  return localStorage.getItem(KEYS.sidebar) !== 'false';
}

export function setSidebarOpen(open: boolean): void {
  localStorage.setItem(KEYS.sidebar, open ? 'true' : 'false');
}

// --- Auth (Supabase multi-user email/password + profiles) ---

async function fetchProfile(userId: string): Promise<{ username: string; email: string; role: AppUser['role'] } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, email, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  // Fail closed: anything that is not exactly 'admin' is treated as 'staf'.
  // This only decides which controls the UI offers — the database is the
  // real boundary (RLS + the role-change trigger in migration
  // 20260805000000) — but an unrecognised value defaulting to 'admin'
  // pointed the wrong way.
  const role: AppUser['role'] = data.role === 'admin' ? 'admin' : 'staf';
  return { username: data.username, email: data.email, role };
}

function getFallbackUsername(email?: string, metadata?: any): string {
  const usernameFromMetadata = metadata?.username?.trim();
  if (usernameFromMetadata) return usernameFromMetadata;
  if (email) return email.split('@')[0];
  return '';
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const profile = await fetchProfile(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return null;
  }

  const email = data.user.email ?? profile.email ?? '';
  const fallbackUsername = getFallbackUsername(email, data.user.user_metadata);

  return {
    id: data.user.id,
    email,
    username: profile.username ?? fallbackUsername,
    role: profile.role,
  };
}

// Self-service registration was removed deliberately. This app holds
// official correspondence for a government office, but every data policy
// is shared-access ("any authenticated user may read/write every record" —
// see migration 20260728114553), so an account is full access to all
// records. Public signup therefore meant anyone on the internet could
// grant themselves that.
//
// Accounts are now provisioned by an admin: create the user in the
// Supabase dashboard (Authentication -> Users -> Add user). The
// handle_new_user trigger (migration 20260728130405) creates the matching
// profiles row automatically, defaulting role to 'staf'. Promote with:
//   update profiles set role = 'admin' where username = '<username>';
//
// Signups must ALSO be disabled in the dashboard (Authentication ->
// Providers -> Email -> "Allow new users to sign up"). Removing this
// function only closes the app's own door — the endpoint stays reachable
// with the public anon key until that toggle is off.

export async function updateUsername(newUsername: string): Promise<void> {
  const trimmed = newUsername.trim();
  if (!trimmed) throw new Error('Username wajib diisi.');
  if (trimmed.length < 2) throw new Error('Username minimal 2 karakter.');

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Sesi tidak valid. Silakan login kembali.');

  // Check uniqueness (exclude our own row)
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', trimmed)
    .neq('id', userData.user.id)
    .maybeSingle();
  if (existing) throw new Error('Username sudah digunakan.');

  const { error } = await supabase
    .from('profiles')
    .update({ username: trimmed })
    .eq('id', userData.user.id);
  if (error) throw new Error('Gagal mengubah username.');
}

export async function loginUser(identifier: string, password: string): Promise<AppUser> {
  const trimmed = identifier.trim();
  if (!trimmed) throw new Error('Email atau username wajib diisi.');
  if (!password) throw new Error('Password wajib diisi.');

  // If the identifier looks like an email, use it directly.
  // Otherwise, look up the email from the profiles table by username.
  let email = trimmed;
  if (!trimmed.includes('@')) {
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', trimmed)
      .maybeSingle();
    if (error) throw new Error('Terjadi kesalahan saat login.');
    if (!data) throw new Error('Username tidak ditemukan.');
    email = (data as { email: string }).email;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
  if (!data.user) throw new Error('Login gagal.');

  const profile = await fetchProfile(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('Akun tidak aktif atau profil tidak ditemukan. Hubungi admin.');
  }

  const fallbackUsername = getFallbackUsername(data.user.email ?? undefined, data.user.user_metadata);
  return {
    id: data.user.id,
    email: data.user.email ?? profile.email ?? '',
    username: profile.username ?? fallbackUsername,
    role: profile.role,
  };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function changePassword(newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('Password baru minimal 6 karakter.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(translateAuthError(error.message));
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email/username atau password salah.';
  if (m.includes('user already registered')) return 'Email sudah terdaftar. Silakan login.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi.';
  if (m.includes('password should be at least')) return 'Password minimal 6 karakter.';
  if (m.includes('rate limit')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  return msg;
}
