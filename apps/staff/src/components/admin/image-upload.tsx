'use client';

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { uploadFile } from '@/lib/queries-admin';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

/** Chọn ảnh → tải lên `POST /uploads` → trả URL công khai. */
export function ImageUpload({ value, onChange, folder = 'menu', label = 'Ảnh', disabled }: { value: string | null; onChange: (url: string | null) => void; folder?: string; label?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type) || file.type === 'application/pdf') return toast.error('Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF');
    if (file.size > MAX_UPLOAD_BYTES) return toast.error('Ảnh vượt quá 5 MB');
    setBusy(true);
    try {
      const res = await uploadFile(file, folder);
      onChange(res.url);
      toast.success('Đã tải ảnh lên');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-300 bg-ink-100/50">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-8 w-8 text-ink-300" />}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="outline" size="sm" loading={busy} disabled={disabled} onClick={() => ref.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {value ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
              <X className="h-4 w-4" /> Gỡ ảnh
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
