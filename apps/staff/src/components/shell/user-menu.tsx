'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut, MapPin, Search, ShieldCheck } from 'lucide-react';
import type { StaffMe } from '@dalan/contracts';
import { cn } from '@/lib/utils';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  // Tên tiếng Việt: chữ cái đầu của tên (từ cuối), thêm họ nếu có
  const last = parts[parts.length - 1]![0] ?? '';
  const first = parts.length > 1 ? (parts[0]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Ảnh đại diện chữ cái (không cần ảnh). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 font-bold text-white ring-2 ring-white', className)}>{initials(name)}</span>;
}

/** Hook đóng popover khi bấm ra ngoài hoặc nhấn Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** Menu người dùng: tên, vai trò, cơ sở, tìm nhanh, đăng xuất. */
export function UserMenu({ me, branchName, onLogout, onSearch }: { me: StaffMe; branchName?: string; onLogout: () => void; onSearch: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản: ${me.fullName}`}
        className="flex min-h-[44px] items-center gap-2 rounded-full py-1 pr-2 pl-1 transition hover:bg-ink-900/[0.05]"
      >
        <Avatar name={me.fullName} className="h-9 w-9 text-sm" />
        <span className="hidden min-w-0 text-left leading-tight xl:block">
          <span className="block max-w-[140px] truncate text-sm font-semibold text-ink-900">{me.fullName}</span>
          <span className="block max-w-[140px] truncate text-xs text-ink-500">{me.roleName}</span>
        </span>
        <ChevronDown className={cn('hidden h-4 w-4 text-ink-500 transition-transform sm:block', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="animate-pop-in absolute top-full right-0 z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl bg-white shadow-overlay ring-1 ring-ink-900/10">
          <div className="flex items-center gap-3 border-b border-ink-100 bg-gradient-to-br from-brand-50 to-white p-4">
            <Avatar name={me.fullName} className="h-12 w-12 text-base" />
            <div className="min-w-0">
              <div className="truncate font-bold text-ink-900">{me.fullName}</div>
              <div className="flex items-center gap-1 truncate text-sm text-ink-500">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> {me.roleName} · {me.code}
              </div>
              {branchName && (
                <div className="flex items-center gap-1 truncate text-sm text-ink-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {branchName}
                </div>
              )}
            </div>
          </div>
          <div className="p-1.5">
            <MenuButton
              icon={Search}
              onClick={() => {
                setOpen(false);
                onSearch();
              }}
            >
              Tìm nhanh màn hình
              <span className="ml-auto text-xs text-ink-300">Ctrl K</span>
            </MenuButton>
            <MenuButton
              icon={LogOut}
              danger
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Đăng xuất
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon: Icon, children, onClick, danger }: { icon: typeof LogOut; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn('flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium transition-colors', danger ? 'text-red-700 hover:bg-red-50' : 'text-ink-700 hover:bg-ink-50')}>
      <Icon className="h-5 w-5 shrink-0" />
      {children}
    </button>
  );
}

/** Chọn cơ sở dạng menu (thay cho ô select thô). */
export function BranchSwitcher({ branches, activeId, onChange }: { branches: StaffMe['branches']; activeId: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const active = branches.find((b) => b.id === activeId);
  const multi = branches.length > 1;
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => multi && setOpen((v) => !v)}
        aria-haspopup={multi ? 'listbox' : undefined}
        aria-expanded={multi ? open : undefined}
        aria-label={multi ? 'Chọn cơ sở' : undefined}
        className={cn('flex min-h-[44px] max-w-full min-w-0 items-center gap-2 rounded-xl px-2.5 text-left transition', multi ? 'hover:bg-ink-900/[0.05]' : 'cursor-default')}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-300/60 ring-inset">
          <MapPin className="h-4 w-4" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="hidden text-[11px] font-medium tracking-wide text-ink-500 uppercase sm:block">Cơ sở</span>
          <span className="block truncate text-sm font-bold text-brand-800 sm:text-[15px]">{active?.name ?? 'Chưa chọn cơ sở'}</span>
        </span>
        {multi && <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-500 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <div role="listbox" aria-label="Cơ sở" className="animate-pop-in absolute top-full left-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl bg-white p-1.5 shadow-overlay ring-1 ring-ink-900/10">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={b.id === activeId}
              onClick={() => {
                onChange(b.id);
                setOpen(false);
              }}
              className={cn('flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left transition-colors', b.id === activeId ? 'bg-brand-50 text-brand-900' : 'text-ink-700 hover:bg-ink-50')}
            >
              <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-700">{b.code}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{b.name}</span>
              {b.id === activeId && <Check className="h-4 w-4 text-brand-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
