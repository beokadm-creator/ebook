import {
  ContentZoneTemplate,
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
}

const AVG_CHAR_WIDTH_RATIO = 0.52;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getFlowZonesForThread = (document: PublishingDocument, page: PublicationPage, thread: TextThread) => {
  const master = document.masters.items.find((item) => item.id === page.masterId);
  const sourceZone = master?.contentZones.find((zone) => zone.id === thread.sourceZoneId);
  if (!master || !sourceZone) {
    return [];
  }

  if (!sourceZone.flowGroupId) {
    return [sourceZone];
  }

  return master.contentZones
    .filter((zone) => zone.flowGroupId === sourceZone.flowGroupId && zone.allowThreadContinuation !== false)
    .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0));
};

const countLinesForThreadText = (text: string, zone: ContentZoneTemplate, thread: TextThread) => {
  const typography = {
    ...zone.style,
    ...(thread.styleOverride ?? {}),
  };
  const usableWidth =
    zone.frame.width - zone.constraints.padding.left - zone.constraints.padding.right;
  const avgCharWidth = typography.fontSize * AVG_CHAR_WIDTH_RATIO;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharWidth));

  return text
    .split('\n')
    .reduce((lineCount, paragraph) => lineCount + Math.max(1, Math.ceil(paragraph.length / charsPerLine)), 0);
};

const estimateHeightForThread = (text: string, zone: ContentZoneTemplate, thread: TextThread) => {
  const typography = {
    ...zone.style,
    ...(thread.styleOverride ?? {}),
  };
  const lines = countLinesForThreadText(text, zone, thread);
  return lines * typography.fontSize * typography.lineHeight;
};

const normalizeCutPoint = (text: string, index: number) => {
  if (index >= text.length) {
    return text.length;
  }

  const paragraph = text.lastIndexOf('\n\n', index);
  if (paragraph > 0) {
    return paragraph + 2;
  }

  const sentence = Math.max(text.lastIndexOf('. ', index), text.lastIndexOf('! ', index), text.lastIndexOf('? ', index));
  if (sentence > 0) {
    return sentence + 2;
  }

  const word = text.lastIndexOf(' ', index);
  if (word > 0) {
    return word + 1;
  }

  return index;
};

const measureBestFit = (text: string, zone: ContentZoneTemplate, thread: TextThread) => {
  const maxHeight = zone.frame.height - zone.constraints.padding.top - zone.constraints.padding.bottom;

  if (estimateHeightForThread(text, zone, thread) <= maxHeight) {
    return { fittedText: text, restText: '' };
  }

  let low = 0;
  let high = text.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);

    if (estimateHeightForThread(candidate, zone, thread) <= maxHeight) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const safeCut = normalizeCutPoint(text, best);
  return {
    fittedText: text.slice(0, safeCut).trimEnd(),
    restText: text.slice(safeCut).trimStart(),
  };
};

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

const createOverflowPage = (
  sourcePage: PublicationPage,
  pageNumber: number,
): PublicationPage => ({
  id: `page_${pageNumber.toString().padStart(3, '0')}`,
  pageNumber,
  masterId: sourcePage.masterId,
  pageRole: sourcePage.pageRole,
  derivedFrom: {
    previousPageId: sourcePage.id,
    reason: 'auto-pagination',
  },
  zones: [],
});

export const repaginateDocument = (document: PublishingDocument, threadIds: string[]) => {
  const next = clone(document);

  for (const threadId of threadIds) {
    const thread = next.threads.find((item) => item.id === threadId);
    if (!thread) {
      continue;
    }

    const sourcePage = next.pages.find((page) => page.id === thread.sourcePageId);
    if (!sourcePage) {
      continue;
    }

    const flowZones = getFlowZonesForThread(next, sourcePage, thread);
    if (!flowZones.length) {
      continue;
    }

    const allPageRefs = new Set(thread.zoneSequence.map((item) => item.pageId));
    next.pages.forEach((page) => {
      if (!allPageRefs.has(page.id)) {
        return;
      }

      const zone = page.zones.find((item) => item.zoneId === thread.sourceZoneId);
      if (!zone) {
        return;
      }

      zone.blocks = zone.blocks.filter((block) => {
        if (block.type !== 'text') {
          return true;
        }

        return block.flow.sourceThreadId !== thread.id;
      });
    });

    let remaining = thread.canonicalText.map((run) => run.text).join('');
    const placements: PaginationSegmentPlacement[] = [];
    let zonePointer = 0;

    while (remaining.length > 0 || placements.length === 0) {
      const activeZone = flowZones[zonePointer % flowZones.length];
      const fit = measureBestFit(remaining, activeZone, thread);
      placements.push({
        zoneId: activeZone.id,
        text: fit.fittedText,
      });
      remaining = fit.restText;
      zonePointer += 1;
      if (!remaining.length) {
        break;
      }
    }

    const segmentedRuns = splitRunsByTexts(thread.canonicalText, placements.map((item) => item.text));
    let pagePointer = next.pages.findIndex((page) => page.id === sourcePage.id);
    const zoneSequence: Array<{ pageId: string; zoneId: string }> = [];

    placements.forEach((placement, segmentIndex) => {
      let page = next.pages[pagePointer];
      if (!page) {
        const previousPage = next.pages[pagePointer - 1] ?? sourcePage;
        page = createOverflowPage(previousPage, previousPage.pageNumber + 1);
        next.pages.splice(pagePointer, 0, page);
      }

      const zone = ensureZoneOnPage(page, placement.zoneId);
      const block = createSegmentBlock(thread, segmentIndex, segmentedRuns[segmentIndex] ?? [{ text: placement.text }]);
      block.flow.isTerminal = segmentIndex === placements.length - 1;
      zone.blocks.unshift(block);
      zoneSequence.push({ pageId: page.id, zoneId: placement.zoneId });

      const zoneOrderIndex = flowZones.findIndex((zoneItem) => zoneItem.id === placement.zoneId);
      if (zoneOrderIndex === flowZones.length - 1) {
        pagePointer += 1;
      }
    });

    thread.zoneSequence = zoneSequence;
  }

  next.pages = next.pages
    .map((page, index) => ({ ...page, pageNumber: index + 1 }))
    .filter((page) => page.zones.some((zone) => zone.blocks.length > 0) || page.pageRole === 'cover');

  return next;
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

  const allPageRefs = new Set(thread.zoneSequence.map((item) => item.pageId));
  next.pages.forEach((page) => {
    if (!allPageRefs.has(page.id)) {
      return;
    }

    const zone = page.zones.find((item) => item.zoneId === thread.sourceZoneId);
    if (!zone) {
      return;
    }

    zone.blocks = zone.blocks.filter((block) => {
      if (block.type !== 'text') {
        return true;
      }

      return block.flow.sourceThreadId !== thread.id;
    });
  });

  const flowZones = getFlowZonesForThread(next, sourcePage, thread);
  let pagePointer = next.pages.findIndex((page) => page.id === sourcePage.id);
  const zoneSequence: Array<{ pageId: string; zoneId: string }> = [];

  const segmentRuns = splitRunsByTexts(thread.canonicalText, segments.map((item) => item.text));

  segments.forEach((segment, segmentIndex) => {
    let page = next.pages[pagePointer];
    if (!page) {
      const previousPage = next.pages[pagePointer - 1] ?? sourcePage;
      page = createOverflowPage(previousPage, previousPage.pageNumber + 1);
      next.pages.splice(pagePointer, 0, page);
    }

    const zone = ensureZoneOnPage(page, segment.zoneId);
    const block = createSegmentBlock(thread, segmentIndex, segmentRuns[segmentIndex] ?? [{ text: segment.text }]);
    block.flow.isTerminal = segmentIndex === segments.length - 1;
    zone.blocks.unshift(block);
    zoneSequence.push({ pageId: page.id, zoneId: segment.zoneId });

    const zoneOrderIndex = flowZones.findIndex((zoneItem) => zoneItem.id === segment.zoneId);
    if (zoneOrderIndex === flowZones.length - 1 || zoneOrderIndex === -1) {
      pagePointer += 1;
    }
  });

  thread.zoneSequence = zoneSequence;
  next.pages = next.pages
    .map((page, index) => ({ ...page, pageNumber: index + 1 }))
    .filter((page) => page.zones.some((zone) => zone.blocks.length > 0) || page.pageRole === 'cover');

  return next;
};
