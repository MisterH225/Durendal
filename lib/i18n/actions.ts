'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { Locale } from './translations'

export async function setLocale(locale: Locale) {
  cookies().set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 an
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}
