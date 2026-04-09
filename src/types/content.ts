export interface BilingualValue {
  ko: string;
  en: string;
}

export interface TOCItem {
  id: string;
  title: BilingualValue;
  level: number;
  blockId: string;
  children?: TOCItem[];
}

export interface Article {
  id: string;
  publicationId: string;
  title: BilingualValue;
  authors?: string;
  abstract?: BilingualValue;
  toc?: TOCItem[];
  order: number;
}

export interface Publication {
  id: string;
  conferenceId: string;
  type: 'abstract' | 'poster' | 'presentation';
  title: BilingualValue;
  coverImage?: string;
  status: 'draft' | 'published';
  publishedAt?: Date;
  createdAt?: Date;
  articles?: Article[];
}

export interface ConferenceBranding {
  logoUrl?: string;
  eventName?: BilingualValue;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface Conference {
  id: string;
  name: BilingualValue;
  description: BilingualValue;
  startDate: string;
  endDate: string;
  venue: BilingualValue;
  organizer: string;
  status: 'draft' | 'published';
  branding?: ConferenceBranding;
  createdAt?: Date;
  publications?: Publication[];
}
