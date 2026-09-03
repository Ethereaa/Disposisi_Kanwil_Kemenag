import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Sidebar, Header, BottomNav } from '@/components/Layout';
import { AuthScreen } from '@/components/AuthScreen';
import { QuickAddFab, type QuickAddTarget } from '@/components/QuickAddFab';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { SkeletonPage, SkeletonDashboard } from '@/components/ui/Skeleton';
import { AgendaPimpinanPreview } from '@/pages/AgendaPimpinanPreview';
import { AgendaPreviewHome } from '@/pages/AgendaPreviewHome';
import { getAllMasuk, getAllKeluar, getAllAgendaPimpinan, consumeTruncationWarnings } from '@/lib/db';
import { getDashboardSnapshot, getGlobalWorkCounts } from '@/lib/dashboardData';
import type { DashboardSnapshot, GlobalWorkCounts } from '@/lib/dashboardData';
import { getRecentSettingsActivity } from '@/lib/settingsData';
import type { SettingsActivityItem } from '@/lib/settingsData';
import { supabase } from '@/lib/supabase';
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

// Route labels for the header's location line. Each page owns its own title and
// description through <PageHeader>, so this is a label map, not page metadata —
// the per-page subtitles that used to live here duplicated copy the pages
// already print for themselves.
const pageLabel: Record<PageKey, string> = {
  dashboard: 'Dashboard',
  'surat-masuk': 'Surat Masuk',
  'surat-keluar': 'Surat Keluar',
  'agenda-pimpinan': 'Agenda Pimpinan',
  export: 'Export Data',
  backup: 'Backup Data',
  settings: 'Settings',
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

// Which datasets each route actually renders — this phase's route-aware
// loading, in one table.
//
// The Dashboard is the point of it: it reads a single server-side summary
// (DashboardSnapshot) and never the three tables that summary is computed
// from, so opening it no longer downloads Surat Masuk, Surat Keluar and Agenda
// Pimpinan in full. Each list route loads its own table and nothing else.
// Export and Backup load nothing: neither renders rows, so each now fetches
// exactly what its file needs at the moment the action runs, and drops it again
// (loadExportData / loadBackupData below). Settings loads nothing either — its
// "Aktivitas Terbaru" panel is ten rows, and getRecentSettingsActivity() reads
// exactly ten candidates per table instead of three whole datasets.
interface RouteData {
  snapshot: boolean;
  masuk: boolean;
  keluar: boolean;
  agenda: boolean;
}

const routeData: Record<PageKey, RouteData> = {
  dashboard: { snapshot: true, masuk: false, keluar: false, agenda: false },
  'surat-masuk': { snapshot: false, masuk: true, keluar: false, agenda: false },
  'surat-keluar': { snapshot: false, masuk: false, keluar: true, agenda: false },
  'agenda-pimpinan': { snapshot: false, masuk: false, keluar: false, agenda: true },
  export: { snapshot: false, masuk: false, keluar: false, agenda: false },
  backup: { snapshot: false, masuk: false, keluar: false, agenda: false },
  settings: { snapshot: false, masuk: false, keluar: false, agenda: false },
};

// What an Export or Backup action pulls from the cloud for the one file it is
// about to write. Structural on purpose: ExportPage and BackupPage declare the
// same shape locally, so neither page has to import a type out of App.
interface ActionDatasets {
  suratMasuk: SuratMasuk[];
  suratKeluar: SuratKeluar[];
  agendaPimpinan: AgendaPimpinan[];
}

// Mirrors ExportPage's own Scope union. A divergence is a compile error at the
// <ExportPage> call site, not a silent mismatch.
type ExportScope = 'all' | 'masuk' | 'keluar' | 'agenda' | 'range';

const EMPTY_WORK_COUNTS: GlobalWorkCounts = { unsignedKeluar: 0, agendaToday: 0 };

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
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [settingsActivity, setSettingsActivity] = useState<SettingsActivityItem[]>([]);
  const [workCounts, setWorkCounts] = useState<GlobalWorkCounts>(EMPTY_WORK_COUNTS);
  const [loading, setLoading] = useState(true);
  const [previewAgendaId, setPreviewAgendaId] = useState<string | null>(() => resolvePreviewRoute());
  const [migrationInfo, setMigrationInfo] = useState<{ masuk: number; keluar: number } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ target: QuickAddTarget; token: number } | null>(null);
  const { toast } = useToast();

  // The active route, for the two listeners that have to survive navigation:
  // the popstate handler (bound once, on mount) and the realtime handlers
  // (bound once per session, so the channel is not torn down and rejoined on
  // every navigation). Both need the CURRENT page, not the one that was in
  // scope when they were created.
  const pageRef = useRef<PageKey>(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // Boot: theme + auth session
  useEffect(() => {
    const t = getTheme();
    setTheme(t);
    applyTheme(t);
    const syncPreviewFromHash = () => {
      setPreviewAgendaId(resolvePreviewRoute());
    };

    const syncRouteFromPath = () => {
      syncPreviewFromHash();
      const route = getPathRoute(window.location.pathname);
      if (route.type === 'page') {
        // Skeleton from the moment the route changes, not from when the load
        // effect gets its turn: each route loads its own data now, so without
        // this a back/forward step would commit one frame of the new route
        // using whatever the previous one happened to leave in state. Guarded,
        // because a popstate resolving to the same page starts no load and
        // would otherwise leave the skeleton up for good.
        if (pageRef.current !== route.page) setLoading(true);
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

  const surfaceTruncationWarnings = useCallback(() => {
    const truncatedTables = consumeTruncationWarnings();
    if (truncatedTables.length > 0) {
      toast(
        `Data ${truncatedTables.join(', ')} sangat banyak — sebagian data terbaru mungkin belum ditampilkan. Hubungi admin untuk penanganan lebih lanjut.`,
        'error',
      );
    }
  }, [toast]);

  const refreshWorkCounts = useCallback(async () => {
    try {
      setWorkCounts(await getGlobalWorkCounts());
    } catch {
      // Badge-only, and two count queries. A failure here must not replace
      // live numbers with zeros, nor raise a toast over whatever the person is
      // actually in the middle of.
    }
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      setSnapshot(await getDashboardSnapshot());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat ringkasan Dashboard.', 'error');
    }
  }, [toast]);

  // Settings' "Aktivitas Terbaru" panel, and nothing else on that route: three
  // narrow LIMIT 10 reads, kept in its own state rather than written back into
  // the three full arrays, which Settings no longer holds. No setLoading(true)
  // — a change somebody else made must not blank the page out from under
  // whoever is mid-way through a username or password form.
  const refreshSettingsActivity = useCallback(async () => {
    try {
      setSettingsActivity(await getRecentSettingsActivity());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat aktivitas terbaru.', 'error');
    }
  }, [toast]);

  // Still a full three-table reload, and still the right shape for the two
  // callers that have it: Backup restore replaces all three tables at once,
  // and the old-local-data migration is a rare, explicit operation.
  const refreshAll = useCallback(async () => {
    setLoading(true);
    // Invalidated up front — everything the summary describes is about to be
    // replaced, so it must not sit there looking fresh. It is refreshed
    // alongside, not inside, the three loads: refreshSnapshot() and
    // refreshWorkCounts() report their own failures instead of rejecting, so a
    // failed summary cannot make a completed restore reload look failed.
    setSnapshot(null);
    try {
      const [m, k, a] = await Promise.all([
        getAllMasuk(),
        getAllKeluar(),
        getAllAgendaPimpinan(),
        refreshSnapshot(),
        refreshWorkCounts(),
      ]);
      setSuratMasuk(m);
      setSuratKeluar(k);
      setAgendaPimpinan(a);
      surfaceTruncationWarnings();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [refreshSnapshot, refreshWorkCounts, surfaceTruncationWarnings, toast]);

  const refreshMasuk = useCallback(async () => {
    try {
      const rows = await getAllMasuk();
      setSuratMasuk(rows);
      surfaceTruncationWarnings();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat Surat Masuk.', 'error');
    }
  }, [surfaceTruncationWarnings, toast]);

  // Surat Keluar and Agenda each feed a Sidebar figure that is on screen on
  // every route, so their refresh keeps the global counts in step — those
  // counts can no longer be filtered out of the full arrays, because the full
  // arrays are no longer always loaded. Surat Masuk feeds neither, which is
  // why refreshMasuk() above has no such companion call.
  const refreshKeluar = useCallback(async () => {
    try {
      const [rows] = await Promise.all([getAllKeluar(), refreshWorkCounts()]);
      setSuratKeluar(rows);
      surfaceTruncationWarnings();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat Surat Keluar.', 'error');
    }
  }, [refreshWorkCounts, surfaceTruncationWarnings, toast]);

  const refreshAgenda = useCallback(async () => {
    try {
      const [rows] = await Promise.all([getAllAgendaPimpinan(), refreshWorkCounts()]);
      setAgendaPimpinan(rows);
      surfaceTruncationWarnings();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat Agenda Pimpinan.', 'error');
    }
  }, [refreshWorkCounts, surfaceTruncationWarnings, toast]);

  // ── Action-local loads ────────────────────────────────────────────────────
  // Export and Backup no longer hold the three datasets, so they no longer make
  // opening the route download them. They ask for the rows at the moment the
  // person actually starts an export or a backup, and only the ones that file
  // needs. Deliberately NOT written into setSuratMasuk/setSuratKeluar/
  // setAgendaPimpinan: this data belongs to one click and dies with the file it
  // produced. Truncation warnings still surface, on the same shared surface as
  // every other load, once the fetches have succeeded.
  const loadExportData = useCallback(
    async (scope: ExportScope): Promise<ActionDatasets> => {
      // 'range' still takes all three in full: the date filter is applied
      // client-side by exportData(), which is unchanged in this phase.
      const wantsAll = scope === 'all' || scope === 'range';
      const [m, k, a] = await Promise.all([
        wantsAll || scope === 'masuk' ? getAllMasuk() : null,
        wantsAll || scope === 'keluar' ? getAllKeluar() : null,
        wantsAll || scope === 'agenda' ? getAllAgendaPimpinan() : null,
      ]);
      surfaceTruncationWarnings();
      return { suratMasuk: m ?? [], suratKeluar: k ?? [], agendaPimpinan: a ?? [] };
    },
    [surfaceTruncationWarnings],
  );

  // A backup file is by definition everything, so this one has no scope to
  // narrow by. Restore is the opposite direction and reads none of this — it
  // works from the uploaded file.
  const loadBackupData = useCallback(async (): Promise<ActionDatasets> => {
    const [m, k, a] = await Promise.all([getAllMasuk(), getAllKeluar(), getAllAgendaPimpinan()]);
    surfaceTruncationWarnings();
    return { suratMasuk: m, suratKeluar: k, agendaPimpinan: a };
  }, [surfaceTruncationWarnings]);

  // Old-local-data check, and the logged-out reset. Keyed on `authed` alone:
  // the route loader below runs on every navigation, and this must not.
  useEffect(() => {
    if (authed) {
      // Check for old local data to migrate
      getLocalMigrationData().then((info) => {
        if (info && (info.masuk > 0 || info.keluar > 0)) {
          setMigrationInfo(info);
        }
      });
      return;
    }
    setSuratMasuk([]);
    setSuratKeluar([]);
    setAgendaPimpinan([]);
    setSnapshot(null);
    setSettingsActivity([]);
    setWorkCounts(EMPTY_WORK_COUNTS);
    // Back to the loading state, so the next session opens on a skeleton
    // rather than on this one's cleared arrays.
    setLoading(true);
    setMigrationInfo(null);
    setMigrationDismissed(false);
  }, [authed]);

  // Route-aware loading: each route loads exactly what it renders, and reloads
  // it on every navigation. Deliberately not a cache — there is no
  // invalidation to get wrong — and `loading`, set at navigation time, is what
  // distinguishes "not fetched yet" from "fetched, and genuinely empty". Below,
  // `null` marks a dataset this route did not ask for; `[]` is a real result
  // and is stored as one.
  //
  // Settings' activity list sits outside the RouteData table on purpose: that
  // table is about the three full datasets, and this route's whole point is
  // that it asks for none of them.
  useEffect(() => {
    if (!authed) return;
    const need = routeData[page];
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [m, k, a, snap, activity] = await Promise.all([
          need.masuk ? getAllMasuk() : null,
          need.keluar ? getAllKeluar() : null,
          need.agenda ? getAllAgendaPimpinan() : null,
          need.snapshot ? getDashboardSnapshot() : null,
          page === 'settings' ? getRecentSettingsActivity() : null,
          refreshWorkCounts(),
        ]);
        if (cancelled) return;
        if (m) setSuratMasuk(m);
        if (k) setSuratKeluar(k);
        if (a) setAgendaPimpinan(a);
        if (snap) setSnapshot(snap);
        if (activity) setSettingsActivity(activity);
        surfaceTruncationWarnings();
      } catch (err) {
        if (!cancelled) toast(err instanceof Error ? err.message : 'Gagal memuat data.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, page, refreshWorkCounts, surfaceTruncationWarnings, toast]);

  // Realtime sync, route-aware: a table change refreshes what the ACTIVE route
  // is actually showing. On the Dashboard that is the summary, not the three
  // tables behind it; on a list route it is that route's own table; on Settings
  // it is the ten-row activity list, which every one of the three tables feeds.
  // A change to a table no visible route holds refreshes nothing but the global
  // counts, which are two count queries and are on screen (as Sidebar badges)
  // everywhere — realtime must never pull down a dataset the route never loaded.
  useEffect(() => {
    if (!authed) return;

    const onMasukChange = () => {
      const active = pageRef.current;
      // Neither Sidebar figure counts Surat Masuk, so there is nothing else to
      // keep in step here.
      if (active === 'dashboard') refreshSnapshot();
      else if (active === 'settings') refreshSettingsActivity();
      else if (routeData[active].masuk) refreshMasuk();
    };

    const onKeluarChange = () => {
      const active = pageRef.current;
      if (active === 'dashboard') {
        // The summary carries the Dashboard's own unsigned figure; the sidebar
        // badge does not come from it, so it is refreshed alongside.
        refreshSnapshot();
        refreshWorkCounts();
      } else if (active === 'settings') {
        // Same split as the Dashboard: the activity list is its own read, and
        // the unsigned badge is still on screen here, so it needs the counts.
        refreshSettingsActivity();
        refreshWorkCounts();
      } else if (routeData[active].keluar) {
        refreshKeluar(); // refreshes the badge itself
      } else {
        refreshWorkCounts();
      }
    };

    const onAgendaChange = () => {
      const active = pageRef.current;
      if (active === 'dashboard') {
        refreshSnapshot();
        refreshWorkCounts();
      } else if (active === 'settings') {
        // The Agenda "hari ini" figure in the sidebar has the same claim on
        // this route as the unsigned badge above.
        refreshSettingsActivity();
        refreshWorkCounts();
      } else if (routeData[active].agenda) {
        refreshAgenda(); // refreshes the count itself
      } else {
        refreshWorkCounts();
      }
    };

    const channel = supabase
      .channel('data-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_masuk' }, onMasukChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_keluar' }, onKeluarChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_pimpinan' }, onAgendaChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed, refreshSnapshot, refreshSettingsActivity, refreshMasuk, refreshKeluar, refreshAgenda, refreshWorkCounts]);

  // ── Shell callbacks ───────────────────────────────────────────────────────
  // Everything below is handed to a memoised chrome component (Sidebar, Header,
  // BottomNav, QuickAddFab), so each one is wrapped in useCallback. The stable
  // identity IS the mechanism: Root re-renders on any of a dozen unrelated data
  // states, and a handler rebuilt on each of those renders would fail the memo's
  // shallow compare and repaint the chrome anyway. Deps are the minimum that
  // keeps behaviour byte-identical — `theme` and `page` are read, so they are
  // listed; the setters and module-scope helpers are already stable.
  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    persistTheme(next);
    applyTheme(next);
  }, [theme]);

  // The drawer's two chrome entry points, previously inline arrows in the JSX —
  // the one thing that would have kept Sidebar/Header/BottomNav re-rendering
  // regardless of the memo.
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const handleNavigate = useCallback(
    (p: PageKey) => {
      // Skeleton from the moment navigation starts, for the same reason as in the
      // popstate handler above. Guarded on an actual page change: navigating to
      // the page already open (Quick Add does exactly that) starts no load, and
      // an unguarded setLoading(true) would strand the skeleton there.
      if (p !== page) setLoading(true);
      setPage(p);
      window.history.pushState({}, '', buildRoutePath(pagePathMap[p]));
      setSidebarOpen(false);
    },
    [page],
  );

  // "+ Tambah Cepat" floating button: jump to the right page (even if a
  // different one is currently open) and signal it to pop its own "add"
  // form modal straight away, so entering a new surat/agenda never
  // requires navigating there first.
  const handleQuickAdd = useCallback(
    (target: QuickAddTarget) => {
      handleNavigate(target);
      setQuickAdd({ target, token: Date.now() });
    },
    [handleNavigate],
  );

  // The token above is a ONE-SHOT event, so the page that acts on it drops it
  // straight away. Leaving it parked in state was enough to make the add form
  // behave like a mode nobody could leave: the page subtree is remounted on
  // navigation (`key={page}`) and again on every refresh() — including the
  // refresh a save triggers — and each fresh mount replayed the stale token,
  // reopening the form on top of the list the person was trying to reach.
  const clearQuickAdd = useCallback(() => setQuickAdd(null), []);

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

    const targetRoute = getPathRoute(targetPath);
    setPage(targetRoute.type === 'page' ? targetRoute.page : 'dashboard');
  }

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setAuthed(false);
    setPage('dashboard');
    window.history.replaceState({}, '', buildRoutePath('/login'));
  }, []);

  const handleUserUpdated = useCallback(() => {
    getCurrentUser().then(setUser);
  }, []);

  async function handleMigrate() {
    setMigrating(true);
    try {
      const result = await migrateLocalDataToCloud();
      await deleteOldLocalDatabase();
      toast(`${result.masuk} surat masuk dan ${result.keluar} surat keluar berhasil dipindahkan ke cloud.`, 'success');
      setMigrationInfo(null);
      setMigrationDismissed(true);
      refreshAll();
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
    return <div className="app-canvas min-h-screen" />;
  }

  if (!authed) {
    const currentRoute = normalizePath(window.location.pathname);
    if (currentRoute === '/login' || currentRoute === '/logout' || currentRoute === '/') {
      return <AuthScreen onAuthed={handleAuthed} />;
    }
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  const showMigration = migrationInfo && !migrationDismissed;
  // Both counts feed the sidebar: the badge on "Surat Keluar" and the work card
  // above the logout button. They used to be filtered out of the full arrays,
  // which only held while every route loaded every table. They are now two
  // count-only queries (getGlobalWorkCounts), refreshed on every route load and
  // on every change to either table, whichever route is open.

  // The Dashboard is the one route that isn't header-plus-table, so it gets a
  // skeleton shaped like itself. Purely which placeholder to draw — no new
  // state, and every other route keeps the shared one.
  const pageFallback = page === 'dashboard' ? <SkeletonDashboard /> : <SkeletonPage />;

  if (window.location.pathname === '/login' && !authed) {
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  if (window.location.pathname === '/logout') {
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  return (
    <div className="app-canvas min-h-screen">
      <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        active={page}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onToggle={toggleSidebar}
        username={user?.username || ''}
        onLogout={handleLogout}
        suratKeluarBadge={workCounts.unsignedKeluar}
        agendaTodayCount={workCounts.agendaToday}
      />
      <QuickAddFab onSelect={handleQuickAdd} />
      <BottomNav
        active={page}
        onNavigate={handleNavigate}
        onMore={openSidebar}
        suratKeluarBadge={workCounts.unsignedKeluar}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          pageLabel={pageLabel[page]}
          onMenuClick={openSidebar}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {/* The one authenticated content frame. Gutters step 16 → 24 → 32px and
            match the header's, so the location line and the page title share a
            left edge at every width. Bottom clearance for the mobile tab bar is
            the footer's job (below), not padding here — both used to carry it,
            which left ~96px of dead canvas above the footer on a phone. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {showMigration && (
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-panel p-4 animate-slide-up">
              <div className="h-10 w-10 rounded-control bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Cloud size={20} />
              </div>
              <div className="flex-1">
                <p className="text-body-strong text-blue-900 dark:text-blue-100">Pindahkan data lama ke cloud</p>
                <p className="text-label font-normal tracking-normal text-blue-700 dark:text-blue-300">
                  Ditemukan {migrationInfo!.masuk} surat masuk dan {migrationInfo!.keluar} surat keluar tersimpan di perangkat ini. Pindahkan ke cloud agar bisa diakses dari mana saja.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={handleMigrate} disabled={migrating}>
                  {migrating ? 'Memindahkan...' : 'Pindahkan'}
                </Button>
                <IconButton
                  icon={<X size={16} />}
                  label="Tutup pemberitahuan"
                  onClick={() => setMigrationDismissed(true)}
                  className="text-blue-700 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-300 dark:hover:bg-blue-900/40 dark:hover:text-blue-100"
                />
              </div>
            </div>
          )}

          {loading ? (
            pageFallback
          ) : (
            <Suspense fallback={pageFallback}>
              {/* Route transition. `key={page}` is what makes it fire: React
                  remounts this subtree on navigation, so the animation replays.
                  Only page content moves — the sidebar, header and tab bar are
                  outside it and stay put. 220ms, fade + 4px, and the
                  prefers-reduced-motion block in index.css overrides it to
                  effectively nothing for anyone who has asked for that. */}
              <div key={page} className="animate-page-in">
                {/* The summary is the Dashboard's only data source, so there is
                    nothing to render until it arrives. If the load failed the
                    toast has already said so and the skeleton is the honest
                    placeholder — better than a page of zeroes. */}
                {page === 'dashboard' && (snapshot ? <Dashboard snapshot={snapshot} onNavigate={handleNavigate} /> : pageFallback)}
                {page === 'surat-masuk' && <SuratMasukPage rows={suratMasuk} onRefresh={refreshMasuk} canDelete={user?.role === 'admin'} quickAddSignal={quickAdd?.target === 'surat-masuk' ? quickAdd.token : undefined} onQuickAddHandled={clearQuickAdd} />}
                {page === 'surat-keluar' && <SuratKeluarPage rows={suratKeluar} onRefresh={refreshKeluar} canDelete={user?.role === 'admin'} quickAddSignal={quickAdd?.target === 'surat-keluar' ? quickAdd.token : undefined} onQuickAddHandled={clearQuickAdd} />}
                {page === 'agenda-pimpinan' && <AgendaPimpinanPage rows={agendaPimpinan} onRefresh={refreshAgenda} canDelete={user?.role === 'admin'} quickAddSignal={quickAdd?.target === 'agenda-pimpinan' ? quickAdd.token : undefined} onQuickAddHandled={clearQuickAdd} />}
                {page === 'export' && <ExportPage loadData={loadExportData} />}
                {page === 'backup' && <BackupPage loadData={loadBackupData} onRefresh={refreshAll} canRestore={user?.role === 'admin'} />}
                {page === 'settings' && <SettingsPage theme={theme} onToggleTheme={toggleTheme} onUserUpdated={handleUserUpdated} recentActivity={settingsActivity} />}
              </div>
            </Suspense>
          )}
        </main>
        <footer className="border-t border-office-border px-4 py-4 pb-[calc(1rem+64px+env(safe-area-inset-bottom))] text-center text-micro font-normal tracking-normal text-office-subtext dark:border-slate-700 dark:text-slate-500 sm:px-6 lg:px-8 lg:pb-4">
          {APP_TITLE}
        </footer>
      </div>
      </div>
    </div>
  );
}
