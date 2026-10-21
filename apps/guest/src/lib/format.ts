import { formatVnd } from '@dalan/domain';

export { formatVnd };

/** Tên món theo ngôn ngữ, lùi về tiếng Việt nếu chưa có bản dịch. */
export function localizedName(locale: string, name: string, nameEn?: string | null): string {
  return locale === 'en' && nameEn ? nameEn : name;
}

export function formatTime(iso: string | null | undefined, locale = 'vi'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
