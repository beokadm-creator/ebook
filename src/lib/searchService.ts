import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { SearchResult } from '@/components/search/SearchBar';

// 타입 정의 추가로 any 타입 제거 및 안정성 확보
export interface ConferenceData {
  id: string;
  name?: { ko?: string; en?: string };
  description?: { ko?: string; en?: string };
  [key: string]: unknown;
}

export interface PublicationData {
  id: string;
  title?: string | { ko?: string; en?: string };
  conferenceId?: string;
  [key: string]: unknown;
}

class SearchService {
  private searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private conferencesCache: ConferenceData[] | null = null;
  private publicationsCache: PublicationData[] | null = null;
  private cacheTimestamp = 0;

  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly DATA_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  /**
   * Search across all cached content
   */
  public async search(searchQuery: string): Promise<SearchResult[]> {
    if (!searchQuery.trim()) return [];

    const searchTerm = searchQuery.toLowerCase();
    
    // Check search term cache
    const cached = this.searchCache.get(searchTerm);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.results;
    }

    // Ensure data is loaded
    await this.ensureDataLoaded();

    const results: SearchResult[] = [];

    // Search conferences
    if (this.conferencesCache) {
      for (const data of this.conferencesCache) {
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
      }
    }

    // Search publications
    if (this.publicationsCache) {
      for (const data of this.publicationsCache) {
        const titleObj = data.title as { ko?: string; en?: string } | undefined;
        const titleKo = (typeof data.title === 'string' ? data.title : titleObj?.ko || '').toLowerCase();
        const titleEn = (typeof data.title === 'string' ? '' : titleObj?.en || '').toLowerCase();

        if (titleKo.includes(searchTerm) || titleEn.includes(searchTerm)) {
          results.push({
            id: data.id,
            type: 'publication',
            title: typeof data.title === 'string' ? data.title : titleObj?.ko || '',
            conferenceId: data.conferenceId,
            publicationId: data.id,
            relevance: titleKo.includes(searchTerm) ? 0.9 : 0.5,
          });
        }
      }
    }

    // Cache and cleanup
    this.searchCache.set(searchTerm, { results, timestamp: Date.now() });
    this.cleanupCache();

    return results;
  }

  /**
   * Clears all caches to force a refresh on next search
   */
  public clearCache(): void {
    this.searchCache.clear();
    this.conferencesCache = null;
    this.publicationsCache = null;
    this.cacheTimestamp = 0;
  }

  private async ensureDataLoaded(): Promise<void> {
    const now = Date.now();
    const needsRefresh = !this.conferencesCache || !this.publicationsCache || now - this.cacheTimestamp > this.DATA_CACHE_DURATION;

    if (!needsRefresh) return;

    try {
      const [confsSnap, pubsSnap] = await Promise.all([
        getDocs(collection(db, 'conferences')),
        getDocs(collection(db, 'publications'))
      ]);

      this.conferencesCache = confsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ConferenceData);
      this.publicationsCache = pubsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as PublicationData);
      this.cacheTimestamp = now;
    } catch (error) {
      console.error('Failed to load search data:', error);
      // Keep old cache if fetch fails
    }
  }

  private cleanupCache(): void {
    if (this.searchCache.size > 100) {
      const entries = Array.from(this.searchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      // Remove oldest 50 entries
      entries.slice(0, 50).forEach(([key]) => this.searchCache.delete(key));
    }
  }
}

// Singleton instance
export const searchServiceInstance = new SearchService();

// Backward compatibility exports
export const searchContent = (query: string) => searchServiceInstance.search(query);
export const clearSearchCache = () => searchServiceInstance.clearCache();
