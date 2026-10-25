'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  List,
  House,
  UserCircle,
  Gear,
  ArrowsLeftRight,
  X,
  Scissors,
} from '@phosphor-icons/react';
import SignOutButton from '@/components/sign-out-button';
import { Wordmark as BrandWordmark, Monogram } from '@/components/brand/wordmark';

const COLLAPSE_KEY = 'sidebar-collapsed';
const COLLAPSE_EVENT = 'sidebar-collapsed-change';

// Top bar is separated by a tone step, not a line. Only the drawer truly
// floats, so it is the one thing allowed a shadow (see the <dialog> class).
const TOPBAR_CLS =
  'sticky top-0 z-40 flex items-center justify-between bg-surface px-4 py-2 lg:hidden';

// Owner's collapse preference lives in localStorage — an external store.
// useSyncExternalStore (not an effect + setState) keeps hydration correct:
// server renders expanded, the client snapshot takes over right after.
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}
function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function getCollapsedServerSnapshot() {
  return false;
}

/**
 * App shell for every authenticated surface: a collapsible grouped sidebar
 * on desktop, a slide-over drawer behind a sticky top bar on mobile.
 * Nav is grouped by domain (Workspace / Account); sign-out lives at the
 * bottom, visually separated from routine destinations.
 */
const NAV_GROUPS = [
  {
    title: 'Workspace',
    links: [
      { href: '/dashboard', label: 'Dashboard', icon: House },
      { href: '/generate', label: 'New CV', icon: Scissors },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/profile', label: 'Profile', icon: UserCircle },
      { href: '/settings', label: 'Settings', icon: Gear },
    ],
  },
] as const;

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[13px] font-medium text-mute">
              {group.title}
            </p>
          )}
          <ul className="space-y-1">
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? label : undefined}
                    title={collapsed ? label : undefined}
                    className={
                      'flex min-h-10 items-center gap-3 border-l-[3px] border-transparent px-3 py-2 text-sm transition-colors ' +
                      (active
                        ? 'border-primary bg-surface-2 font-medium text-ink'
                        : 'text-mute hover:bg-surface-2/70 hover:text-ink') +
                      (collapsed ? ' justify-center px-0' : '')
                    }
                  >
                    <Icon aria-hidden weight={active ? 'fill' : 'regular'} className="shrink-0" size={20} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Wordmark() {
  return (
    <Link
      href="/dashboard"
      className="flex min-h-10 items-center px-3 py-2 transition-colors hover:bg-surface-2"
    >
      <BrandWordmark className="text-xl" />
    </Link>
  );
}

export default function AppShell({ children, email }: { children: ReactNode; email?: string }) {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);

  // The drawer is a native <dialog>: showModal() brings the focus trap, the
  // initial focus, the Escape handling and the focus restore for free.
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    if (drawerOpen && !el.open) el.showModal();
    if (!drawerOpen && el.open) el.close();
  }, [drawerOpen]);

  const toggleCollapsed = useCallback(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, getCollapsedSnapshot() ? '0' : '1');
      window.dispatchEvent(new Event(COLLAPSE_EVENT));
    } catch {
      /* storage unavailable — the toggle is just session-local */
    }
  }, []);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-surface lg:flex ' +
          (collapsed ? 'w-[76px]' : 'w-60')
        }
      >
        <div className="px-2 pt-3">
          {collapsed ? (
            <Link
              href="/dashboard"
              aria-label="Sever"
              title="Sever"
              className="mx-auto flex size-10 items-center justify-center transition-colors hover:bg-surface-2"
            >
              <Monogram className="text-xl" />
            </Link>
          ) : (
            <Wordmark />
          )}
        </div>
        <NavLinks collapsed={collapsed} />
        <div className="px-3 py-3">
          <SignOutButton variant="nav" compact={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          className="mx-3 mb-3 flex min-h-10 items-center justify-center gap-2 px-3 py-2 text-sm text-mute transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowsLeftRight aria-hidden size={18} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      {/* Mobile sticky top bar */}
      <header className={TOPBAR_CLS}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="flex size-10 items-center justify-center text-mute transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <List aria-hidden size={22} />
        </button>
        <Wordmark />
        <span className="size-10" aria-hidden />
      </header>

      {/* Mobile drawer (native dialog; opened via showModal in the effect) */}
      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        onClose={() => setDrawerOpen(false)}
        onClick={(e) => {
          // A click outside the dialog's own rectangle lands on its backdrop.
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
            setDrawerOpen(false);
          }
        }}
        // hidden/open:flex — the flex utility would otherwise override the
        // dialog's UA display:none and leave the drawer always on screen.
        className="fixed inset-0 z-50 m-0 hidden h-dvh w-72 max-w-[85vw] flex-col border-r border-line bg-surface p-0 shadow-xl open:flex [&::backdrop]:bg-ink/40 lg:hidden" // taste-skill-ignore: the drawer is the one surface allowed a shadow
      >
        <div className="flex items-center justify-between px-2 pt-3">
          <Wordmark />
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="mr-2 flex size-10 items-center justify-center text-mute transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden size={20} />
          </button>
        </div>
        <NavLinks collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        <div className="px-3 py-3">
          <SignOutButton variant="nav" onNavigate={() => setDrawerOpen(false)} />
        </div>
      </dialog>

      {/* Page content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {email && (
          <div className="hidden justify-end px-6 pt-4 text-[13px] text-mute lg:flex">
            {email}
          </div>
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
