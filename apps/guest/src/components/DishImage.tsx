'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/format';

/** Ảnh món; khi chưa có ảnh (hoặc ảnh lỗi) hiển thị nền thương hiệu với chữ cái đầu. */
export function DishImage({ src, name, className, sizes = '120px', priority, large }: { src: string | null; name: string; className?: string; sizes?: string; priority?: boolean; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className={cn('relative overflow-hidden bg-cream-dark', className)}>
        <Image src={src} alt="" fill sizes={sizes} priority={priority} className="object-cover" onError={() => setFailed(true)} />
      </div>
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || 'D';
  return (
    <div className={cn('dish-placeholder relative flex items-center justify-center overflow-hidden', className)} aria-hidden>
      <span className={cn('absolute aspect-square rounded-full border border-gold/25', large ? 'h-44' : 'h-[68%]')} />
      <span className={cn('absolute aspect-square rounded-full border border-maroon/10', large ? 'h-56' : 'h-[86%]')} />
      <span className={cn('relative font-serif font-bold text-maroon/55', large ? 'text-7xl' : 'text-3xl')}>{initial}</span>
    </div>
  );
}
