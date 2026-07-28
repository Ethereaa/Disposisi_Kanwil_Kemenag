import { type ReactNode } from 'react';
import {
  LayoutDashboard,
  Inbox,
  Send,
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
}

const menu: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'surat-masuk', label: 'Surat Masuk', icon: Inbox },
  { key: 'surat-keluar', label: 'Surat Keluar', icon: Send },
  { key: 'export', label: 'Export Data', icon: Download },
  { key: 'backup', label: 'Backup Data', icon: DatabaseBackup },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({ active, onNavigate, open, onToggle, theme, onToggleTheme, email, username, onLogout }: SidebarProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/60 lg:hidden animate-fade-in" onClick={onToggle} />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 bg-office-sidebar text-slate-200 flex flex-col transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <Logo size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">Kanwil Kemenag</p>
            <p className="text-xs text-slate-400 truncate">Provinsi Gorontalo</p>
          </div>
          <button onClick={onToggle} className="lg:hidden text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Menu</p>
          {menu.map((m) => {
            const Icon = m.icon;
            const isActive = active === m.key;
            return (
              <button
                key={m.key}
                onClick={() => onNavigate(m.key)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left ${
                  isActive
                    ? 'bg-office-sidebarActive text-white shadow-md shadow-blue-900/30'
                    : 'text-slate-300 hover:bg-office-sidebarHover hover:text-white'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'} />
                {m.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={onToggleTheme}>
              {theme === 'dark' ? <><Sun size={15} /> Light</> : <><Moon size={15} /> Dark</>}
            </Button>
          </div>
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/5">
            <div className="h-8 w-8 rounded-full bg-office-primary text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {(username || email).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{username || email}</p>
              <p className="text-[11px] text-slate-400 truncate">{username ? email : 'Anggota Keluarga'}</p>
            </div>
            <button onClick={onLogout} title="Keluar" className="text-slate-400 hover:text-red-400 transition-colors p-1">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
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
    <header className="sticky top-0 z-20 bg-office-header dark:bg-slate-800 border-b border-office-border dark:border-slate-700">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
        <button onClick={onMenuClick} className="lg:hidden text-office-text dark:text-slate-200">
          <Menu size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-office-text dark:text-slate-100 truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-office-subtext dark:text-slate-400 truncate">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

export { APP_TITLE, APP_SHORT };
