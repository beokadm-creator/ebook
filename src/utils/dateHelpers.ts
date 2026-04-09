/**
 * Date formatting utilities for consistent date display
 */

/**
 * Format date string to Korean locale
 * @param dateString - ISO date string
 * @returns Formatted date string or '-' if invalid
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return '-';
  }
}

/**
 * Format date string to short format (YYYY.MM.DD)
 * @param dateString - ISO date string
 * @returns Short formatted date string
 */
export function formatShortDate(dateString: string): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return '-';
  }
}

/**
 * Format datetime string to Korean locale
 * @param dateString - ISO datetime string
 * @returns Formatted datetime string
 */
export function formatDateTime(dateString: string): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
}
