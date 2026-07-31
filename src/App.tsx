import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { Sidebar, Header } from '@/components/Layout';
import { AuthScreen } from '@/components/AuthScreen';
import { QuickAddFab, type QuickAddTarget } from '@/components/QuickAddFab';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { AgendaPimpinanPreview } from '@/pages/AgendaPimpinanPreview';
import { AgendaPreviewHome } from '@/pages/AgendaPreviewHome';
import { getAllMasuk, getAllKeluar, getAllAgendaPimpinan } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { initLogo } from '@/lib/logo';
import { getTheme, setTheme as persistTheme, applyTheme, getCurrentUser, logout } from '@/lib/storage';
import { getLocalMigrationData, migrateLocalDataToCloud, deleteOldLocalDatabase } from '@/lib/migrate';
import type { PageKey, Theme, SuratMasuk, SuratKeluar, AgendaPimpinan, AppUser } from '@/types';
import { APP_TITLE } from '@/types';
import { Cloud, X } from 'lucide-react';

// Route-level code splitting: each page becomes its own JS chunk so the
// initial bundle only pays for the page the user lands on first.
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const SuratMasukPage = lazy(() => import('@/pages/SuratMasukPage').then((m) => ({ default: m.SuratMasukPage })));
const SuratKeluarPage = lazy(() => import('@/pages/SuratKeluarPage').then((m) => ({ default: m.SuratKeluarPage })));
const AgendaPimpinanPage = lazy(() => import('@/pages/AgendaPimpinanPage').then((m) => ({ default: m.AgendaPimpinanPage })));
const ExportPage = lazy(() => import('@/pages/ExportPage').then((m) => ({ default: m.ExportPage })));
const BackupPage = lazy(() => import('@/pages/BackupPage').then((m) => ({ default: m.BackupPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const pageMeta: Record<PageKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Ringkasan disposisi surat' },
  'surat-masuk': { title: 'Surat Masuk', subtitle: 'Kelola disposisi surat masuk' },
  'surat-keluar': { title: 'Surat Keluar', subtitle: 'Kelola disposisi surat keluar' },
  'agenda-pimpinan': { title: 'Agenda Pimpinan', subtitle: 'Kelola agenda pimpinan dan disposisi pegawai' },
  export: { title: 'Export Data', subtitle: 'Unduh data ke Excel atau Word' },
  backup: { title: 'Backup Data', subtitle: 'Cadangkan dan pulihkan data' },
  settings: { title: 'Settings', subtitle: 'Profil, keamanan, dan tampilan' },
};

const pagePathMap: Record<PageKey, string> = {
  dashboard: '/dashboard',
  'surat-masuk': '/surat-masuk',
  'surat-keluar': '/surat-keluar',
  'agenda-pimpinan': '/agenda-pimpinan',
  export: '/export',
  backup: '/backup',
  settings: '/settings',
};

const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';

function normalizePath(pathname: string) {
  const withoutBase = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  const cleanPath = withoutBase.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  return cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
}

// Resolves what the standalone Preview Agenda Pimpinan screen should show
// for the current URL, checking (in order): hash-based preview routes
// (#/agenda-preview-home, #/agenda-preview/:id — used by push notification
// links and older shared links), then clean-path routes (/agenda-preview,
// /agenda-preview/:id — used when the link is opened fresh / typed
// directly). Returns '__home__' for the list, an id for a single agenda,
// or null if the current URL isn't a preview route at all.
function resolvePreviewRoute(): string | null {
  const hash = window.location.hash;
  if (hash === '#/agenda-preview-home') return '__home__';
  const hashMatch = hash.match(/^#\/agenda-preview\/(.+)$/);
  if (hashMatch) return hashMatch[1];

  const cleanPath = normalizePath(window.location.pathname);
  if (cleanPath === '/agenda-preview') return '__home__';
  const pathMatch = cleanPath.match(/^\/agenda-preview\/(.+)$/);
  if (pathMatch) return pathMatch[1];

  return null;
}

function buildRoutePath(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (BASE_PATH === '/') return normalizedPath;
  return `${BASE_PATH}${normalizedPath}`;
}

function getPathRoute(pathname: string): { type: 'page'; page: PageKey } | { type: 'login' } | { type: 'logout' } {
  const cleanPath = normalizePath(pathname);
  if (cleanPath === '/login') return { type: 'login' };
  if (cleanPath === '/logout') return { type: 'logout' };

  const page = Object.entries(pagePathMap).find(([, path]) => path === cleanPath)?.[0] as PageKey | undefined;
  if (page) return { type: 'page', page };
  return { type: 'page', page: 'dashboard' };
}

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const [authed, setAuthed] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [page, setPage] = useState<PageKey>('dashboard');
  const [theme, setTheme] = useState<Theme>('light');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [suratMasuk, setSuratMasuk] = useState<SuratMasuk[]>([]);
  const [suratKeluar, setSuratKeluar] = useState<SuratKeluar[]>([]);
  const [agendaPimpinan, setAgendaPimpinan] = useState<AgendaPimpinan[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewAgendaId, setPreviewAgendaId] = useState<string | null>(() => resolvePreviewRoute());
  const [migrationInfo, setMigrationInfo] = useState<{ masuk: number; keluar: number } | null>(null);
  const [routePage, setRoutePage] = useState<PageKey>('dashboard');
  const [migrating, setMigrating] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ target: QuickAddTarget; token: number } | null>(null);
  const { toast } = useToast();

  // Boot: theme + auth session
  useEffect(() => {
    const t = getTheme();
    setTheme(t);
    applyTheme(t);
    initLogo();
    const syncPreviewFromHash = () => {
      setPreviewAgendaId(resolvePreviewRoute());
    };

    const syncRouteFromPath = () => {
      syncPreviewFromHash();
      const route = getPathRoute(window.location.pathname);
      if (route.type === 'page') {
        setRoutePage(route.page);
        setPage(route.page);
      }
    };

    syncPreviewFromHash();
    syncRouteFromPath();
    window.addEventListener('hashchange', syncPreviewFromHash);
    window.addEventListener('popstate', syncRouteFromPath);
    (async () => {
      const u = await getCurrentUser();
      setUser(u);
      if (u) setAuthed(true);
      setBootChecked(true);
    })();
    return () => {
      window.removeEventListener('hashchange', syncPreviewFromHash);
      window.removeEventListener('popstate', syncRouteFromPath);
    };
  }, []);

  // Listen for auth state changes (login / logout / token refresh)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const u = await getCurrentUser();
          setUser(u);
          setAuthed(true);
        } else {
          setUser(null);
          setAuthed(false);
        }
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [m, k, a] = await Promise.all([getAllMasuk(), getAllKeluar(), getAllAgendaPimpinan()]);
      setSuratMasuk(m);
      setSuratKeluar(k);
      setAgendaPimpinan(a);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load data when authed
  useEffect(() => {
    if (authed) {
      refresh();
      // Check for old local data to migrate
      getLocalMigrationData().then((info) => {
        if (info && (info.masuk > 0 || info.keluar > 0)) {
          setMigrationInfo(info);
        }
      });
    } else {
      setSuratMasuk([]);
      setSuratKeluar([]);
      setAgendaPimpinan([]);
      setMigrationInfo(null);
      setMigrationDismissed(false);
    }
  }, [authed, refresh]);

  // Realtime sync: refresh when any table changes (other family members editing)
  useEffect(() => {
    if (!authed) return;
    const channel = supabase
      .channel('surat-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_masuk' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_keluar' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed, refresh]);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    persistTheme(next);
    applyTheme(next);
  }

  function handleNavigate(p: PageKey) {
    setPage(p);
    setRoutePage(p);
    window.history.pushState({}, '', buildRoutePath(pagePathMap[p]));
    setSidebarOpen(false);
  }

  // "+ Tambah Cepat" floating button: jump to the right page (even if a
  // different one is currently open) and signal it to pop its own "add"
  // form modal straight away, so entering a new surat/agenda never
  // requires navigating there first.
  function handleQuickAdd(target: QuickAddTarget) {
    handleNavigate(target);
    setQuickAdd({ target, token: Date.now() });
  }

  function handleAuthed(user?: AppUser) {
    setAuthed(true);
    if (user) {
      setUser(user);
    } else {
      getCurrentUser().then((u) => {
        if (u) setUser(u);
      });
    }
    const currentRoute = normalizePath(window.location.pathname);
    const targetPath = currentRoute === '/login' || currentRoute === '/logout' ? '/dashboard' : currentRoute;
    if (targetPath && targetPath !== currentRoute) {
      window.history.replaceState({}, '', buildRoutePath(targetPath));
    }
    setPage('dashboard');
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setAuthed(false);
    setPage('dashboard');
    setRoutePage('dashboard');
    window.history.replaceState({}, '', buildRoutePath('/login'));
  }

  function handleUserUpdated() {
    getCurrentUser().then(setUser);
  }

  async function handleMigrate() {
    setMigrating(true);
    try {
      const result = await migrateLocalDataToCloud();
      await deleteOldLocalDatabase();
      toast(`${result.masuk} surat masuk dan ${result.keluar} surat keluar berhasil dipindahkan ke cloud.`, 'success');
      setMigrationInfo(null);
      setMigrationDismissed(true);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memindahkan data.', 'error');
    } finally {
      setMigrating(false);
    }
  }

  // The standalone "Preview Agenda Pimpinan" screens — both the list
  // (previewAgendaId === '__home__') and a single shared agenda
  // (previewAgendaId === an id) — are a fully independent, public route.
  // They fetch their own data and must never depend on the auth bootstrap
  // chain (getCurrentUser() → supabase.auth.getUser() + fetchProfile()) or
  // on data already loaded into Root's state, so they work from any
  // device, logged in or not, and render before bootChecked/authed are
  // even evaluated. They are also read-only by design: no click-through
  // into the rest of the app, so there is nothing for a "back" action to
  // get confused about.
  if (previewAgendaId === '__home__') {
    return <AgendaPreviewHome />;
  }
  if (previewAgendaId) {
    return (
      <AgendaPimpinanPreview
        agendaId={previewAgendaId}
        onClose={() => {
          window.history.replaceState(null, '', buildRoutePath('/dashboard'));
          setPreviewAgendaId(null);
        }}
      />
    );
  }

  if (!bootChecked) {
    return <div className="min-h-screen bg-office-bg dark:bg-slate-900" />;
  }

  if (!authed) {
    const currentRoute = normalizePath(window.location.pathname);
    if (currentRoute === '/login' || currentRoute === '/logout' || currentRoute === '/') {
      return <AuthScreen onAuthed={handleAuthed} />;
    }
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  const meta = pageMeta[page];
  const showMigration = migrationInfo && !migrationDismissed;
  const unsignedCount = suratKeluar.filter((s) => !s.ditandatangani).length;

  if (window.location.pathname === '/login' && !authed) {
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  if (window.location.pathname === '/logout') {
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(135deg,_#f7fcf8,_#f2f7f3_55%,_#eef5fb)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_35%),linear-gradient(135deg,_#020617,_#0f172a_55%,_#111827)]">
      <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        active={page}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        theme={theme}
        onToggleTheme={toggleTheme}
        email={user?.email || 'Pengguna'}
        username={user?.username || ''}
        onLogout={handleLogout}
        suratKeluarBadge={unsignedCount}
      />
      <QuickAddFab onSelect={handleQuickAdd} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-6">
          {showMigration && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 animate-slide-up">
              <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Cloud size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Pindahkan data lama ke cloud</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Ditemukan {migrationInfo!.masuk} surat masuk dan {migrationInfo!.keluar} surat keluar tersimpan di perangkat ini. Pindahkan ke cloud agar bisa diakses dari mana saja.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={handleMigrate} disabled={migrating}>
                  {migrating ? 'Memindahkan...' : 'Pindahkan'}
                </Button>
                <button onClick={() => setMigrationDismissed(true)} className="p-1.5 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md">
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonPage />
          ) : (
            <Suspense fallback={<SkeletonPage />}>
              <div className="animate-fade-in">
                {page === 'dashboard' && <Dashboard suratMasuk={suratMasuk} suratKeluar={suratKeluar} agendaPimpinan={agendaPimpinan} onNavigate={handleNavigate} />}
                {page === 'surat-masuk' && <SuratMasukPage rows={suratMasuk} onRefresh={refresh} canDelete={user?.role !== 'staf'} quickAddSignal={quickAdd?.target === 'surat-masuk' ? quickAdd.token : undefined} />}
                {page === 'surat-keluar' && <SuratKeluarPage rows={suratKeluar} onRefresh={refresh} canDelete={user?.role !== 'staf'} quickAddSignal={quickAdd?.target === 'surat-keluar' ? quickAdd.token : undefined} />}
                {page === 'agenda-pimpinan' && <AgendaPimpinanPage rows={agendaPimpinan} onRefresh={refresh} canDelete={user?.role !== 'staf'} quickAddSignal={quickAdd?.target === 'agenda-pimpinan' ? quickAdd.token : undefined} />}
                {page === 'export' && <ExportPage suratMasuk={suratMasuk} suratKeluar={suratKeluar} agendaPimpinan={agendaPimpinan} />}
                {page === 'backup' && <BackupPage suratMasuk={suratMasuk} suratKeluar={suratKeluar} agendaPimpinan={agendaPimpinan} onRefresh={refresh} />}
                {page === 'settings' && <SettingsPage theme={theme} onToggleTheme={toggleTheme} onUserUpdated={handleUserUpdated} suratMasuk={suratMasuk} suratKeluar={suratKeluar} agendaPimpinan={agendaPimpinan} />}
              </div>
            </Suspense>
          )}
        </main>
        <footer className="border-t border-office-border px-4 py-3 text-center text-[11px] text-office-subtext dark:border-slate-700 dark:text-slate-500 sm:px-6">
          {APP_TITLE}
        </footer>
      </div>
      </div>
    </div>
  );
}
