'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from './request';

/** Server action: lưu ngôn ngữ đã chọn vào cookie 1 năm. */
export async function setLocale(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax' });
}
