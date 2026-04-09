/**
 * Bilingual value utilities for handling Korean/English text
 */

import type { BilingualValue } from '@/types/content';

/**
 * Extract local text from bilingual value or string
 * @param val - Bilingual value or string
 * @returns Localized text (Korean preferred, falls back to English)
 */
export function getLocalValue(val: BilingualValue | string | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val.ko || val.en || '';
}

/**
 * Create a bilingual value from separate Korean and English strings
 * @param ko - Korean text
 * @param en - English text
 * @returns Bilingual value object
 */
export function createBilingual(ko: string, en: string): BilingualValue {
  return { ko, en };
}

/**
 * Check if a value is bilingual
 * @param val - Value to check
 * @returns true if the value is a bilingual object
 */
export function isBilingual(val: unknown): val is BilingualValue {
  return typeof val === 'object' && val !== null && 'ko' in val && 'en' in val;
}
