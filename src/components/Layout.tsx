import {
  LayoutDashboard,
  Inbox,
  Send,
  Briefcase,
  Download,
  DatabaseBackup,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { Logo } from './Logo';
import { IconButton } from './ui/IconButton';
import { APP_TITLE, APP_SHORT, type PageKey, type Theme } from '@/types';

interface SidebarProps {
  active: PageKey;
  onNavigate: (page: PageKey) => void;
  open: boolean;
  onToggle: () => void;
  email: string;
  username: string;
  onLogout: () => void;
  /** Count of surat keluar belum ditandatangani — shown as a red badge on the menu item so it's visible from any page, not just the Dashboard. */
  suratKeluarBadge?: number;
}

const menu: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'surat-masuk', label: 'Surat Masuk', icon: Inbox },
  { key: 'surat-keluar', label: 'Surat Keluar', icon: Send },
  { key: 'agenda-pimpinan', label: 'Agenda Pimpinan', icon: Briefcase },
  { key: 'export', label: 'Export Data', icon: Download },
  { key: 'backup', label: 'Backup Data', icon: DatabaseBackup },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({ active, onNavigate, open, onToggle, email, username, onLogout, suratKeluarBadge = 0 }: SidebarProps) {
  return (
    <>
      {/* z-[35] sits between the bottom nav / FAB (z-30) and the drawer panel
          (z-40). At z-30 it tied with <BottomNav>, which renders after
          <Sidebar> in App.tsx and therefore painted OVER the scrim: with the
          drawer open the tab bar stayed bright and tappable, so a phone user
          could navigate from behind the overlay. */}
      {open && (
        <div className="fixed inset-0 z-[35] bg-slate-900/70 lg:hidden" onClick={onToggle} />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 flex flex-col overflow-hidden border-r border-white/10 sidebar-gradient text-slate-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-normal ease-brand lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Institutional identity: the organisation, not the app's design
            name. The decorative emerald radial that used to sit behind this
            column is gone — the sidebar gradient is the only treatment it
            needs, and two stacked gradients washed out the active state. */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control border border-white/15 bg-white/10">
            <Logo size={32} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-strong text-white">Kanwil Kemenag</p>
            <p className="truncate text-micro font-normal tracking-normal text-slate-300">Provinsi Gorontalo</p>
          </div>
          <button
            onClick={onToggle}
            aria-label="Tutup menu"
            title="Tutup menu"
            className="focus-ring-inverse flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-slate-300 transition-colors duration-fast ease-brand hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
          <p className="px-2 pb-2 text-micro uppercase text-slate-400">Menu</p>
          <ul className="space-y-0.5">
            {menu.map((m) => {
              const Icon = m.icon;
              const isActive = active === m.key;
              const badge = m.key === 'surat-keluar' ? suratKeluarBadge : 0;
              return (
                <li key={m.key}>
                  <button
                    onClick={() => onNavigate(m.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`focus-ring-inverse group relative flex min-h-11 w-full items-center gap-3 rounded-control py-2.5 pl-4 pr-2.5 text-left transition-colors duration-fast ease-brand ${
                      isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    {/* ONE active indicator: a single hairline rail plus a
                        barely-there tint. No glow + border + gradient + shadow
                        stacked together. It is white, not green: the sidebar
                        surface itself shifts toward green down the column, so a
                        green marker would lose contrast on the lower items. */}
                    {isActive && (
                      <span aria-hidden="true" className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-white" />
                    )}
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${isActive ? 'text-body-strong' : 'text-body'}`}>{m.label}</span>
                    {badge > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center rounded-chip bg-rose-500 px-1.5 py-0.5 text-micro text-white"
                        title={`${badge} surat keluar belum ditandatangani`}
                      >
                        {badge} belum TTD
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Account zone, separated from navigation by a rule and its own label
            so the column reads as two zones (where to go / who you are)
            instead of one long list that ends in a stray button. The theme
            toggle that used to sit here as a full-width secondary Button moved
            to the header command bar: it is an app-wide control, not an
            account setting, and it was the loudest element in the sidebar. */}
        <div className="border-t border-white/10 p-3">
          <p className="px-2 pb-2 text-micro uppercase text-slate-400">Akun</p>
          <div className="flex items-center gap-2.5 rounded-control bg-white/[0.06] p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-office-primary text-body-strong text-white">
              {(username || email.split('@')[0]).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label text-white">{username || email.split('@')[0]}</p>
              <p className="truncate text-micro font-normal tracking-normal text-slate-400">{username ? email : 'Pengguna Kanwil'}</p>
            </div>
            <button
              onClick={onLogout}
              title="Keluar"
              aria-label="Keluar"
              className="focus-ring-inverse flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-slate-300 transition-colors duration-fast ease-brand hover:bg-white/10 hover:text-white lg:h-9 lg:w-9"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

const bottomNavItems: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'surat-masuk', label: 'Surat Masuk', icon: Inbox },
  { key: 'surat-keluar', label: 'Surat Keluar', icon: Send },
  { key: 'agenda-pimpinan', label: 'Agenda', icon: Briefcase },
];

interface BottomNavProps {
  active: PageKey;
  onNavigate: (page: PageKey) => void;
  onMore: () => void;
  /** Count of surat keluar belum ditandatangani — mirrors the Sidebar badge so it's visible from the tab bar too. */
  suratKeluarBadge?: number;
}

// `text-micro` supplies the size only; font-normal + tracking-normal hold the
// rendered weight and letter-spacing where they were, because at 360px five
// tabs leave ~68px per label and "Surat Masuk" only just fits.
const bottomNavLabel = 'w-full truncate text-center text-micro font-normal tracking-normal';
// min-h-14 = 56px: the whole tab is the target, so nothing here is a 28px
// hitbox. The active marker is a single top rail — the same one-indicator rule
// the sidebar follows, mirrored to the opposite edge of the screen.
const bottomNavTab = 'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors duration-fast ease-brand';
const bottomNavRail = 'absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-office-primary dark:bg-emerald-400';

/** Fixed bottom tab bar for small screens — the sidebar drawer remains reachable via the "Lainnya" tab, which opens it, so Export/Backup/Settings stay one tap away without needing their own slots. */
export function BottomNav({ active, onNavigate, onMore, suratKeluarBadge = 0 }: BottomNavProps) {
  const moreActive = active === 'export' || active === 'backup' || active === 'settings';
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-office-border bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-900 lg:hidden"
      aria-label="Navigasi bawah"
    >
      {bottomNavItems.map((m) => {
        const Icon = m.icon;
        const isActive = active === m.key;
        const badge = m.key === 'surat-keluar' ? suratKeluarBadge : 0;
        return (
          <button
            key={m.key}
            onClick={() => onNavigate(m.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`${bottomNavTab} ${isActive ? 'text-office-primary dark:text-emerald-400' : 'text-office-subtext dark:text-slate-400'}`}
          >
            {isActive && <span aria-hidden="true" className={bottomNavRail} />}
            <Icon size={20} />
            <span className={bottomNavLabel}>{m.label}</span>
            {badge > 0 && (
              <span className="absolute right-1/4 top-1.5 h-2 w-2 rounded-full bg-rose-500" title={`${badge} surat keluar belum ditandatangani`} />
            )}
          </button>
        );
      })}
      <button
        onClick={onMore}
        aria-current={moreActive ? 'page' : undefined}
        className={`${bottomNavTab} ${moreActive ? 'text-office-primary dark:text-emerald-400' : 'text-office-subtext dark:text-slate-400'}`}
      >
        {moreActive && <span aria-hidden="true" className={bottomNavRail} />}
        <Menu size={20} />
        <span className={bottomNavLabel}>Lainnya</span>
      </button>
    </nav>
  );
}

interface HeaderProps {
  /**
   * Label of the current route, rendered as location context — deliberately
   * NOT as the page title.
   *
   * Phase 2C settled the split: this bar owns app-level context, <PageHeader>
   * owns each page's own title and its actions. That is why there is no
   * `actions` slot here any more. One existed and was rendered, but no caller
   * ever passed it, and two homes for the same primary action is exactly what
   * the split exists to prevent.
   */
  pageLabel: string;
  onMenuClick: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ pageLabel, onMenuClick, theme, onToggleTheme }: HeaderProps) {
  return (
    // pt-[env(safe-area-inset-top)] on the sticky bar itself: installed as a
    // PWA the app draws under the status bar, and without this the menu button
    // and the theme toggle sit beneath it. Zero on every non-notched device and
    // in the browser tab, so desktop is unchanged.
    <header className="sticky top-0 z-20 border-b border-office-border bg-white pt-[env(safe-area-inset-top)] dark:border-slate-700 dark:bg-slate-900">
      {/* Shares <main>'s frame — same max width, same 16 → 24 → 32px gutter
          ramp — so the location line above and the page title below sit on one
          left edge. The bar's border and background stay full-width; only this
          row is capped, which is what keeps the rule spanning the column while
          the text still lines up past 1536px, where max-w-7xl starts biting. */}
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:h-16 sm:px-6 lg:px-8">
        <IconButton
          icon={<Menu size={18} />}
          label="Buka menu navigasi"
          size="md"
          onClick={onMenuClick}
          className="lg:hidden"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-micro uppercase text-office-subtext dark:text-slate-500">Disposisi &amp; Agenda Pimpinan</p>
          <p className="truncate text-body-strong text-office-text dark:text-slate-100">{pageLabel}</p>
        </div>
        <IconButton
          icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          size="md"
          onClick={onToggleTheme}
        />
      </div>
    </header>
  );
}

export { APP_TITLE, APP_SHORT };
