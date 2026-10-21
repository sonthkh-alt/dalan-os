import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';
export const LOCALE_COOKIE = 'dalan-locale';

function isLocale(value: string | undefined): value is Locale {
  return value === 'vi' || value === 'en';
}

/** Ngôn ngữ: cookie do người dùng chọn → Accept-Language của thiết bị → tiếng Việt. */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = DEFAULT_LOCALE;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const accept = (await headers()).get('accept-language') ?? '';
    const first = accept.split(',')[0]?.trim().toLowerCase() ?? '';
    if (first.startsWith('en')) locale = 'en';
  }
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages, timeZone: 'Asia/Ho_Chi_Minh' };
});
