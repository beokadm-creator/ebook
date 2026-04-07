export interface BilingualValue {
  ko: string;
  en: string;
}

export interface HeadingContent {
  text: BilingualValue;
  level: number;
}

export interface TextContent {
  html: BilingualValue;
}

export interface ImageContent {
  url: string;
  caption?: BilingualValue;
  alt?: BilingualValue;
  width?: number;
  height?: number;
}

export interface VideoContent {
  platform: 'vimeo' | 'youtube';
  videoId: string;
  thumbnail?: string;
  title?: BilingualValue;
}

export interface AdContent {
  advertiser: string;
  imageUrl: string;
  linkUrl: string;
  skipable: boolean;
}

export interface ListContent {
  items: BilingualValue[];
  ordered: boolean;
}

export interface FootnoteContent {
  number: number;
  content: BilingualValue;
  referenceId: string;
}

// Individual block types for discriminated union
export interface HeadingBlock {
  id: string;
  type: 'heading';
  content: HeadingContent;
  order: number;
  createdAt?: Date;
}

export interface TextBlock {
  id: string;
  type: 'text';
  content: TextContent;
  order: number;
  createdAt?: Date;
}

export interface ImageBlock {
  id: string;
  type: 'image';
  content: ImageContent;
  order: number;
  createdAt?: Date;
}

export interface VideoBlock {
  id: string;
  type: 'video';
  content: VideoContent;
  order: number;
  createdAt?: Date;
}

export interface AdBlock {
  id: string;
  type: 'ad';
  content: AdContent;
  order: number;
  createdAt?: Date;
}

export interface ListBlock {
  id: string;
  type: 'list';
  content: ListContent;
  order: number;
  createdAt?: Date;
}

export interface FootnoteBlock {
  id: string;
  type: 'footnote';
  content: FootnoteContent;
  order: number;
  createdAt?: Date;
}

// Discriminated union - use this for type-safe code
export type ContentBlock = HeadingBlock | TextBlock | ImageBlock | VideoBlock | AdBlock | ListBlock | FootnoteBlock;

// Type helpers
export type ContentBlockType = ContentBlock['type'];

export interface Article {
  id: string;
  publicationId: string;
  title: BilingualValue;
  toc: TOCItem[];
  author: string;
  order: number;
  contentBlocks: ContentBlock[];
  footnotes: FootnoteContent[];
  createdAt?: Date;
}

export interface TOCItem {
  id: string;
  title: BilingualValue;
  level: number;
  blockId: string;
  children?: TOCItem[];
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