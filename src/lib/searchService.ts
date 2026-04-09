import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { SearchResult } from '@/components/search/SearchBar';

// In-memory cache for search results
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// In-memory cache for conference and publication data
let conferencesCache: any[] | null = null;
let publicationsCache: any[] | null = null;
let cacheTimestamp = 0;
const DATA_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function searchContent(searchQuery: string): Promise<SearchResult[]> {
  if (!searchQuery.trim()) return [];

  const searchTerm = searchQuery.toLowerCase();
  const cacheKey = searchTerm;

  // Check if we have cached results for this exact search
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.results;
  }

  const results: SearchResult[] = [];

  // Load data from cache or fetch fresh data
  const now = Date.now();
  const needsRefresh = !conferencesCache || !publicationsCache || now - cacheTimestamp > DATA_CACHE_DURATION;

  if (needsRefresh) {
    try {
      const [confsSnap, pubsSnap] = await Promise.all([
        getDocs(collection(db, 'conferences')),
        getDocs(collection(db, 'publications'))
      ]);

      conferencesCache = confsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      publicationsCache = pubsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      cacheTimestamp = now;
    } catch (error) {
      console.error('Failed to load search data:', error);
      // If fetch fails but we have old cache, use it
      if (!conferencesCache || !publicationsCache) {
        return [];
      }
    }
  }

  // Search conferences (using cached data)
  conferencesCache?.forEach((data: any) => {
    const nameKo = (data.name?.ko || '').toLowerCase();
    const nameEn = (data.name?.en || '').toLowerCase();
    const descKo = (data.description?.ko || '').toLowerCase();

    if (nameKo.includes(searchTerm) || nameEn.includes(searchTerm) || descKo.includes(searchTerm)) {
      results.push({
        id: data.id,
        type: 'conference',
        title: data.name?.ko || data.name?.en || '',
        description: data.description?.ko || '',
        conferenceId: data.id,
        relevance: nameKo.includes(searchTerm) ? 1.0 : 0.6,
      });
    }
  });

  // Search publications (using cached data)
  publicationsCache?.forEach((data: any) => {
    const titleKo = (typeof data.title === 'string' ? data.title : data.title?.ko || '').toLowerCase();
    const titleEn = (typeof data.title === 'string' ? '' : data.title?.en || '').toLowerCase();

    if (titleKo.includes(searchTerm) || titleEn.includes(searchTerm)) {
      results.push({
        id: data.id,
        type: 'publication',
        title: typeof data.title === 'string' ? data.title : data.title?.ko || '',
        conferenceId: data.conferenceId,
        publicationId: data.id,
        relevance: titleKo.includes(searchTerm) ? 0.9 : 0.5,
      });
    }
  });

  // Cache the results
  searchCache.set(cacheKey, { results, timestamp: Date.now() });

  // Clean up old cache entries
  if (searchCache.size > 100) {
    const entries = Array.from(searchCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    // Remove oldest 50 entries
    entries.slice(0, 50).forEach(([key]) => searchCache.delete(key));
  }

  return results;
}

/**
 * Clear all search caches (call when data is updated)
 */
export function clearSearchCache(): void {
  searchCache.clear();
  conferencesCache = null;
  publicationsCache = null;
  cacheTimestamp = 0;
}
