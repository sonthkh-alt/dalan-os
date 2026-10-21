'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/format';

export function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}/5`}
          onClick={() => onChange(n)}
          className={cn('rounded-full p-1.5 transition active:scale-95', n <= value ? 'text-gold' : 'text-line')}
        >
          <Star className="h-10 w-10" fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}
