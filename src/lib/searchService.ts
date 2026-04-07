import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { SearchResult } from '@/components/search/SearchBar';

export async function searchContent(searchQuery: string): Promise<SearchResult[]> {
  if (!searchQuery.trim()) return [];

  const results: SearchResult[] = [];
  const searchTerm = searchQuery.toLowerCase();

  // Search conferences
  const confsSnap = await getDocs(collection(db, 'conferences'));
  confsSnap.forEach(doc => {
    const data = doc.data();
    const nameKo = (data.name?.ko || '').toLowerCase();
    const nameEn = (data.name?.en || '').toLowerCase();
    const descKo = (data.description?.ko || '').toLowerCase();

    if (nameKo.includes(searchTerm) || nameEn.includes(searchTerm) || descKo.includes(searchTerm)) {
      results.push({
        id: doc.id,
        type: 'conference',
        title: data.name?.ko || data.name?.en || '',
        description: data.description?.ko || '',
        conferenceId: doc.id,
        relevance: nameKo.includes(searchTerm) ? 1.0 : 0.6,
      });
    }
  });

  // Search publications
  const pubsSnap = await getDocs(collection(db, 'publications'));
  pubsSnap.forEach(doc => {
    const data = doc.data();
    const titleKo = (typeof data.title === 'string' ? data.title : data.title?.ko || '').toLowerCase();
    const titleEn = (typeof data.title === 'string' ? '' : data.title?.en || '').toLowerCase();

    if (titleKo.includes(searchTerm) || titleEn.includes(searchTerm)) {
      results.push({
        id: doc.id,
        type: 'publication',
        title: typeof data.title === 'string' ? data.title : data.title?.ko || '',
        conferenceId: data.conferenceId,
        publicationId: doc.id,
        relevance: titleKo.includes(searchTerm) ? 0.9 : 0.5,
      });
    }
  });

  return results;
}
