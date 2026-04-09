import {
  MasterTemplate,
  PageBlock,
  PublicationPage,
  PublishingDocument,
  TextBlockNode,
  TextRun,
  TextThread,
} from '@/types/publishing';
import { splitRunsByTexts } from '@/lib/publishing/richText';

export interface PaginationSegmentPlacement {
  zoneId: string;
  text: string;
  pageOffset?: number;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;





const createSegmentBlock = (thread: TextThread, segmentIndex: number, runs: TextRun[]): TextBlockNode => ({
  id: `${thread.id}_seg_${segmentIndex.toString().padStart(3, '0')}`,
  type: 'text',
  semanticRole: thread.semanticRole,
  locked: false,
  scope: 'page-editable',
  visible: true,
  flow: {
    sourceThreadId: thread.id,
    segmentIndex,
    isContinuation: segmentIndex > 0,
    isTerminal: false,
  },
  content: {
    runs,
  },
  styleOverride: thread.styleOverride,
  ebook: thread.ebook,
});

const ensureZoneOnPage = (page: PublicationPage, zoneId: string) => {
  let zone = page.zones.find((item) => item.zoneId === zoneId);
  if (!zone) {
    zone = { zoneId, blocks: [] };
    page.zones.push(zone);
  }
  return zone;
};

const syncPageZonesWithMaster = (page: PublicationPage, master: MasterTemplate) => {
  master.contentZones.forEach((zoneTemplate) => {
    ensureZoneOnPage(page, zoneTemplate.id);
  });
};

const createOverflowPageId = () => `page_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createOverflowPage = (
  sourcePage: PublicationPage,
  master: MasterTemplate,
  previousPageId: string,
  pageNumber: number,
): PublicationPage => ({
  id: createOverflowPageId(),
  pageNumber,
  masterId: sourcePage.masterId,
  pageRole: sourcePage.pageRole,
  derivedFrom: {
    previousPageId,
    reason: 'auto-pagination',
  },
  zones: master.contentZones.map((zone) => ({
    zoneId: zone.id,
    blocks: [],
  })),
});

const getExistingOverflowPageIds = (thread: TextThread) =>
  Array.from(new Set(thread.zoneSequence.map((item) => item.pageId).filter((pageId) => pageId !== thread.sourcePageId)));

const resolveThreadPageForOffset = (
  pages: PublicationPage[],
  sourcePage: PublicationPage,
  master: MasterTemplate,
  existingOverflowPageIds: string[],
  pageOffset: number,
  pageCache: Map<number, PublicationPage>,
) => {
  const cachedPage = pageCache.get(pageOffset);
  if (cachedPage) {
    syncPageZonesWithMaster(cachedPage, master);
    return cachedPage;
  }

  if (pageOffset === 0) {
    syncPageZonesWithMaster(sourcePage, master);
    pageCache.set(0, sourcePage);
    return sourcePage;
  }

  const existingPageId = existingOverflowPageIds[pageOffset - 1];
  const existingPage = existingPageId ? pages.find((page) => page.id === existingPageId) : null;
  if (existingPage && existingPage.masterId === sourcePage.masterId) {
    syncPageZonesWithMaster(existingPage, master);
    pageCache.set(pageOffset, existingPage);
    return existingPage;
  }

  const previousPage = resolveThreadPageForOffset(
    pages,
    sourcePage,
    master,
    existingOverflowPageIds,
    pageOffset - 1,
    pageCache,
  );
  const previousIndex = pages.findIndex((page) => page.id === previousPage.id);
  const insertIndex = previousIndex >= 0 ? previousIndex + 1 : pages.length;
  const page = createOverflowPage(sourcePage, master, previousPage.id, previousPage.pageNumber + 1);
  pages.splice(insertIndex, 0, page);
  pageCache.set(pageOffset, page);
  return page;
};

export const repaginateDocument = (document: PublishingDocument, _threadIds: string[]) => {
  // CSS columns mode - pagination handled by FlowGroupContainer
  // CSS columns 방식에서는 브라우저가 텍스트 플로우를 처리하므로
  // 미리 텍스트를 분할할 필요 없음
  return document;
};

export const collectEbookBlocks = (document: PublishingDocument): PageBlock[] =>
  document.pages.flatMap((page) =>
    page.zones.flatMap((zone) =>
      zone.blocks.filter((block) => block.ebook.include && block.visible),
    ),
  );

export const applyThreadPaginationSegments = (
  document: PublishingDocument,
  threadId: string,
  segments: PaginationSegmentPlacement[],
) => {
  const next = clone(document);
  const thread = next.threads.find((item) => item.id === threadId);
  if (!thread) {
    return next;
  }

  const sourcePage = next.pages.find((page) => page.id === thread.sourcePageId);
  if (!sourcePage) {
    return next;
  }
  const sourceMaster = next.masters.items.find((item) => item.id === sourcePage.masterId);
  if (!sourceMaster) {
    return next;
  }

  next.pages.forEach((page) => {
    page.zones.forEach((zone) => {
      zone.blocks = zone.blocks.filter((block) => {
        if (block.type !== 'text') {
          return true;
        }

        return block.flow.sourceThreadId !== thread.id;
      });
    });
  });

  const existingOverflowPageIds = getExistingOverflowPageIds(thread);
  const zoneSequence: Array<{ pageId: string; zoneId: string }> = [];
  const pageCache = new Map<number, PublicationPage>([[0, sourcePage]]);

  const segmentRuns = splitRunsByTexts(thread.canonicalText, segments.map((item) => item.text));

  segments.forEach((segment, segmentIndex) => {
    const page = resolveThreadPageForOffset(
      next.pages,
      sourcePage,
      sourceMaster,
      existingOverflowPageIds,
      segment.pageOffset ?? 0,
      pageCache,
    );

    const zone = ensureZoneOnPage(page, segment.zoneId);
    const block = createSegmentBlock(thread, segmentIndex, segmentRuns[segmentIndex] ?? [{ text: segment.text }]);
    block.flow.isTerminal = segmentIndex === segments.length - 1;
    zone.blocks.push(block);
    zoneSequence.push({ pageId: page.id, zoneId: segment.zoneId });
  });

  thread.zoneSequence = zoneSequence;
  next.pages = next.pages
    .map((page, index) => ({ ...page, pageNumber: index + 1 }))
    .filter((page) => page.zones.some((zone) => zone.blocks.length > 0) || page.pageRole === 'cover');

  return next;
};
