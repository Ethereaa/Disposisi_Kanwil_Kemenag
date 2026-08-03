import { type ReactNode } from 'react';
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
import { Button } from './ui/Button';
import { APP_TITLE, APP_SHORT, type PageKey, type Theme } from '@/types';

interface SidebarProps {
  active: PageKey;
  onNavigate: (page: PageKey) => void;
  open: boolean;
  onToggle: () => void;
  theme: Theme;
  onToggleTheme: () => void;
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

export function Sidebar({ active, onNavigate, open, onToggle, theme, onToggleTheme, email, username, onLogout, suratKeluarBadge = 0 }: SidebarProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/75 lg:hidden" onClick={onToggle} />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 flex flex-col overflow-hidden border-r border-white/10 sidebar-gradient text-slate-100 transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.28),transparent_45%)]" />
        <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-2">
            <Logo size={38} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-white">Kanwil Kemenag</p>
            <p className="truncate text-xs text-emerald-100/80">Provinsi Gorontalo</p>
          </div>
          <button onClick={onToggle} className="rounded-full p-1.5 text-emerald-100/80 transition-colors hover:bg-white/10 lg:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/70">Menu</p>
          {menu.map((m) => {
            const Icon = m.icon;
            const isActive = active === m.key;
            const badge = m.key === 'surat-keluar' ? suratKeluarBadge : 0;
            return (
              <button
                key={m.key}
                onClick={() => onNavigate(m.key)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-emerald-50/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-emerald-100/80 group-hover:text-white'} />
                <span className="flex-1">{m.label}</span>
                {badge > 0 && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm"
                    title={`${badge} surat keluar belum ditandatangani`}
                  >
                    {badge} belum TTD
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="relative border-t border-white/10 p-3 space-y-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onToggleTheme}>
            {theme === 'dark' ? <><Sun size={15} /> Light</> : <><Moon size={15} /> Dark</>}
          </Button>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-semibold text-white">
              {(username || email.split('@')[0]).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold text-white">{username || email.split('@')[0]}</p>
              <p className="truncate text-[11px] text-emerald-100/75">{username ? email : 'Anggota Keluarga'}</p>
            </div>
            <button onClick={onLogout} title="Keluar" className="rounded-full p-1 text-emerald-100/80 transition-colors hover:bg-white/10 hover:text-white">
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

/** Fixed bottom tab bar for small screens — the sidebar drawer remains reachable via the "Lainnya" tab, which opens it, so Export/Backup/Settings stay one tap away without needing their own slots. */
export function BottomNav({ active, onNavigate, onMore, suratKeluarBadge = 0 }: BottomNavProps) {
  const moreActive = active === 'export' || active === 'backup' || active === 'settings';
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-office-border bg-white/100 pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-800/100 lg:hidden"
      aria-label="Navigasi utama"
    >
      {bottomNavItems.map((m) => {
        const Icon = m.icon;
        const isActive = active === m.key;
        const badge = m.key === 'surat-keluar' ? suratKeluarBadge : 0;
        return (
          <button
            key={m.key}
            onClick={() => onNavigate(m.key)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive ? 'text-office-primary dark:text-emerald-400' : 'text-office-subtext dark:text-slate-400'
            }`}
          >
            <Icon size={20} />
            <span className="truncate">{m.label}</span>
            {badge > 0 && (
              <span className="absolute right-1/4 top-1 h-2 w-2 rounded-full bg-rose-500" title={`${badge} surat keluar belum ditandatangani`} />
            )}
          </button>
        );
      })}
      <button
        onClick={onMore}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
          moreActive ? 'text-office-primary dark:text-emerald-400' : 'text-office-subtext dark:text-slate-400'
        }`}
      >
        <Menu size={20} />
        <span className="truncate">Lainnya</span>
      </button>
    </nav>
  );
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  actions?: ReactNode;
}

export function Header({ title, subtitle, onMenuClick, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-emerald-100/80 bg-white/95 dark:border-slate-700 dark:bg-slate-800/95">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button onClick={onMenuClick} className="rounded-full p-2 text-slate-700 transition-colors hover:bg-emerald-50 lg:hidden dark:text-slate-200 dark:hover:bg-slate-700">
          <Menu size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg font-bold text-slate-800 dark:text-slate-100 sm:text-xl">{title}</h1>
          {subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

export { APP_TITLE, APP_SHORT };
