import { PublishingDocument, TextRun } from '@/types/publishing';

export interface EbookTextEntry {
  id: string;
  type: 'text';
  semanticRole: string;
  text: string;
  runs: TextRun[];
  anchorId: string;
  toc?: {
    id: string;
    level: number;
    label: string;
  };
}

export interface EbookImageEntry {
  id: string;
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
  readingWidth: 'body' | 'full';
  anchorId: string;
}

export type EbookEntry = EbookTextEntry | EbookImageEntry;

export const extractEbookEntries = (document: PublishingDocument, language: 'ko' | 'en' = 'ko') => {
  const entries: EbookEntry[] = [];
  const seenThreads = new Set<string>();

  document.pages.forEach((page) => {
    page.zones.forEach((zone) => {
      zone.blocks.forEach((block) => {
        if (!block.visible || !block.ebook.include) {
          return;
        }

        if (block.type === 'image') {
          entries.push({
            id: block.id,
            type: 'image',
            src: block.assetRef.src,
            alt: block.alt?.[language] || block.alt?.ko || '',
            caption: block.caption?.[language] || block.caption?.ko || '',
            readingWidth: block.ebook.readingWidth ?? 'body',
            anchorId: `entry-${block.id}`,
          });
          return;
        }

        if (seenThreads.has(block.flow.sourceThreadId) && block.flow.segmentIndex > 0) {
          return;
        }

        const thread = document.threads.find((item) => item.id === block.flow.sourceThreadId);
        const text = thread?.canonicalText.map((run) => run.text).join('') ?? '';
        if (!text) {
          return;
        }

        seenThreads.add(block.flow.sourceThreadId);
        const toc =
          block.ebook.toc.enabled && block.ebook.toc.tocId && block.ebook.toc.level && block.ebook.toc.label
            ? {
                id: block.ebook.toc.tocId,
                level: block.ebook.toc.level,
                label: block.ebook.toc.label[language] || block.ebook.toc.label.ko,
              }
            : undefined;

        entries.push({
          id: block.id,
          type: 'text',
          semanticRole: block.semanticRole,
          text,
          runs: thread?.canonicalText ?? [{ text }],
          anchorId: toc?.id ?? `entry-${block.id}`,
          toc,
        });
      });
    });
  });

  return entries;
};
