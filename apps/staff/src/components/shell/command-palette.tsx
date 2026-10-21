'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, MapPin, Search } from 'lucide-react';
import { fold } from '@/lib/ops-utils';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/primitives';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
  keywords?: string;
  /** Điều hướng tới trang; nếu không có thì chạy `run`. */
  href?: string;
  run?: () => void;
  active?: boolean;
}

/** Bảng lệnh Ctrl/⌘+K: gõ để nhảy nhanh tới mọi màn hình người dùng được phép mở. */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<PaletteBody onClose={onClose} commands={commands} />, document.body);
}

function PaletteBody({ onClose, commands }: { onClose: () => void; commands: Command[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return commands;
    const words = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = fold(`${c.label} ${c.group} ${c.hint ?? ''} ${c.keywords ?? ''}`);
      return words.every((w) => hay.includes(w));
    });
  }, [commands, query]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
  }, []);

  // Cuộn mục đang chọn vào tầm nhìn khi dùng phím mũi tên
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    if (c.href) router.push(c.href);
    else c.run?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
      <div className="animate-fade-in absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-dialog-in relative flex max-h-[76dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-overlay ring-1 ring-ink-900/10" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-ink-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-ink-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Tìm màn hình, mục quản trị, cơ sở..."
            className="min-h-[60px] min-w-0 flex-1 bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-300"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[index] ? `cmdk-${results[index].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd className="hidden sm:inline-flex">Esc</Kbd>
        </div>
        <div ref={listRef} id="cmdk-list" role="listbox" className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-10 text-center text-sm text-ink-500">Không tìm thấy “{query}”. Thử từ khóa khác, ví dụ “kho”, “báo cáo”.</p>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const selected = i === index;
            return (
              <div key={c.id}>
                {header && <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">{header}</div>}
                <div
                  id={`cmdk-${c.id}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseMove={() => index !== i && setIndex(i)}
                  onClick={() => choose(c)}
                  className={cn('flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl px-3 transition-colors', selected ? 'bg-brand-50 text-brand-900' : 'text-ink-900')}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700')}>
                    <c.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.label}</span>
                    {c.hint && <span className="block truncate text-xs text-ink-500">{c.hint}</span>}
                  </span>
                  {c.active && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">Đang mở</span>}
                  {selected && <CornerDownLeft className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden items-center gap-4 border-t border-ink-100 bg-ink-50/70 px-4 py-2 text-xs text-ink-500 sm:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> di chuyển
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> mở
          </span>
          <span className="ml-auto flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> DaLan OS
          </span>
        </div>
      </div>
    </div>
  );
}
