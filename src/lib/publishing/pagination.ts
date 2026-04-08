import {
  ContentZoneTemplate,
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

const AVG_CHAR_WIDTH_RATIO = 0.52;
const FLOW_ROW_THRESHOLD_PX = 24;
const SAFE_MARGIN_PX = 1;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sortFlowZonesForReadingOrder = (zones: ContentZoneTemplate[]) =>
  [...zones].sort((left, right) => {
    if (Math.abs(left.frame.y - right.frame.y) > FLOW_ROW_THRESHOLD_PX) {
      return left.frame.y - right.frame.y;
    }
    return left.frame.x - right.frame.x;
  });

const normalizeGroupZones = (zones: ContentZoneTemplate[]) => {
  if (zones.length <= 1) {
    return zones;
  }

  const reference = sortFlowZonesForReadingOrder(zones)[0];
  return zones.map((zone) => ({
    ...zone,
    style: { ...reference.style },
    constraints: clone(reference.constraints),
  }));
};

const isColumnFlowGroup = (zones: ContentZoneTemplate[]) => {
  if (zones.length <= 1) {
    return false;
  }

  const reference = zones[0];
  return zones.every(
    (zone) =>
      Math.abs(zone.frame.y - reference.frame.y) <= 2
      && Math.abs(zone.frame.height - reference.frame.height) <= 2,
  );
};

const getFlowZonesForThread = (document: PublishingDocument, page: PublicationPage, thread: TextThread) => {
  const master = document.masters.items.find((item) => item.id === page.masterId);
  const sourceZone = master?.contentZones.find((zone) => zone.id === thread.sourceZoneId);
  if (!master || !sourceZone) {
    return {
      currentPageZones: [] as ContentZoneTemplate[],
      overflowPageZones: [] as ContentZoneTemplate[],
    };
  }

  if (!sourceZone.flowGroupId) {
    return {
      currentPageZones: [sourceZone],
      overflowPageZones: [sourceZone],
    };
  }

  const groupedZones = normalizeGroupZones(sortFlowZonesForReadingOrder(
    master.contentZones.filter((zone) => zone.flowGroupId === sourceZone.flowGroupId && zone.allowThreadContinuation !== false),
  ));

  if (!groupedZones.length) {
    return {
      currentPageZones: [sourceZone],
      overflowPageZones: [sourceZone],
    };
  }

  const sourceIndex = groupedZones.findIndex((zone) => zone.id === sourceZone.id);
  const startsFromFirstZone = isColumnFlowGroup(groupedZones);
  return {
    currentPageZones: startsFromFirstZone || sourceIndex <= 0 ? groupedZones : groupedZones.slice(sourceIndex),
    overflowPageZones: groupedZones,
  };
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

const isCJK = (text: string) => /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(text.slice(0, 200));

const estimateCharsPerLine = (zoneWidth: number, fontSize: number) => {
  return Math.floor(zoneWidth / (fontSize * 0.55));
};

const normalizeCutPoint = (text: string, index: number, charsPerLine = 40) => {
  if (index >= text.length) {
    return text.length;
  }

  const paragraph = text.lastIndexOf('\n\n', index);
  if (paragraph > 0 && index - paragraph <= charsPerLine / 2) {
    return paragraph + 2;
  }

  const cjk = isCJK(text);
  const searchWindow = cjk ? Math.max(0, index - Math.floor(charsPerLine * 0.6)) : Math.max(0, index - charsPerLine);

  if (!cjk) {
    const sentence = Math.max(
      text.lastIndexOf('. ', index),
      text.lastIndexOf('! ', index),
      text.lastIndexOf('? ', index),
      text.lastIndexOf('.\n', index),
      text.lastIndexOf('!\n', index),
      text.lastIndexOf('?\n', index),
    );
    if (sentence >= searchWindow) {
      return sentence + 2;
    }
  }

  const newline = text.lastIndexOf('\n', index);
  if (newline >= searchWindow) {
    return newline + 1;
  }

  const word = text.lastIndexOf(' ', index);
  if (word >= searchWindow) {
    return word + 1;
  }

  if (cjk) {
    return index;
  }

  return index;
};

const resolveCutPoint = (text: string, bestIndex: number, charsPerLine = 40) => {
  const normalized = normalizeCutPoint(text, bestIndex, charsPerLine);
  if (normalized <= 0) {
    return bestIndex;
  }

  const lostChars = bestIndex - normalized;
  const maxAllowedLoss = Math.max(charsPerLine * 1.2, 10);
  if (lostChars > maxAllowedLoss || normalized < bestIndex * 0.88) {
    return bestIndex;
  }

  return normalized;
};

const measureBestFit = (text: string, zone: ContentZoneTemplate, thread: TextThread) => {
  const maxHeight = zone.frame.height - zone.constraints.padding.top - zone.constraints.padding.bottom - SAFE_MARGIN_PX;

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

  const usableWidth = zone.frame.width - zone.constraints.padding.left - zone.constraints.padding.right;
  const typography = { ...zone.style, ...(thread.styleOverride ?? {}) };
  const cpl = estimateCharsPerLine(usableWidth, typography.fontSize);
  const safeCut = resolveCutPoint(text, best, cpl);
  return {
    fittedText: text.slice(0, safeCut),
    restText: text.slice(safeCut),
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
    const sourceMaster = next.masters.items.find((item) => item.id === sourcePage.masterId);
    if (!sourceMaster) {
      continue;
    }

    const flowZonePlan = getFlowZonesForThread(next, sourcePage, thread);
    if (!flowZonePlan.currentPageZones.length) {
      continue;
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

    let remaining = thread.canonicalText.map((run) => run.text).join('');
    const placements: PaginationSegmentPlacement[] = [];
    let pageOffset = 0;
    let zonePointer = 0;

    while (remaining.length > 0 || placements.length === 0) {
      const activeZones = pageOffset === 0 ? flowZonePlan.currentPageZones : flowZonePlan.overflowPageZones;
      const activeZone = activeZones[zonePointer];
      const fit = measureBestFit(remaining, activeZone, thread);
      placements.push({
        zoneId: activeZone.id,
        text: fit.fittedText,
        pageOffset,
      });
      remaining = fit.restText;
      zonePointer += 1;
      if (remaining.length && zonePointer >= activeZones.length) {
        pageOffset += 1;
        zonePointer = 0;
      }
      if (!remaining.length) {
        break;
      }
    }

    const segmentedRuns = splitRunsByTexts(thread.canonicalText, placements.map((item) => item.text));
    const existingOverflowPageIds = getExistingOverflowPageIds(thread);
    const zoneSequence: Array<{ pageId: string; zoneId: string }> = [];
    const pageCache = new Map<number, PublicationPage>([[0, sourcePage]]);

    placements.forEach((placement, segmentIndex) => {
      const page = resolveThreadPageForOffset(
        next.pages,
        sourcePage,
        sourceMaster,
        existingOverflowPageIds,
        placement.pageOffset ?? 0,
        pageCache,
      );

      const zone = ensureZoneOnPage(page, placement.zoneId);
      const block = createSegmentBlock(thread, segmentIndex, segmentedRuns[segmentIndex] ?? [{ text: placement.text }]);
      block.flow.isTerminal = segmentIndex === placements.length - 1;
      zone.blocks.push(block);
      zoneSequence.push({ pageId: page.id, zoneId: placement.zoneId });
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
