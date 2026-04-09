import { createMainBodyZone } from '@/lib/publishing/defaultDocument';
import { ContributionItem, PublishingDocument } from '@/types/publishing';

const FLOW_ROW_THRESHOLD_PX = 24;

export const sortFlowZonesForReadingOrder = <T extends { frame: { x: number; y: number } }>(zones: T[]) =>
  [...zones].sort((left, right) => {
    if (Math.abs(left.frame.y - right.frame.y) > FLOW_ROW_THRESHOLD_PX) {
      return left.frame.y - right.frame.y;
    }
    return left.frame.x - right.frame.x;
  });

export const inferZoneSlotKey = (zone?: { id: string; name?: string; kind?: string; slotKey?: string }) => {
  if (!zone) {
    return undefined;
  }

  if (zone.slotKey?.trim()) {
    return zone.slotKey.trim();
  }

  const target = `${zone.id} ${zone.name ?? ''}`.toLowerCase();
  if (target.includes('image')) return 'image';
  if (target.includes('cover') || target.includes('title')) return 'title';
  if (target.includes('section') && target.includes('header')) return 'section_title';
  if (target.includes('intro') || target.includes('summary')) return 'summary';
  return zone.kind === 'text-flow' ? 'body' : undefined;
};

export const getChainRootPageId = (document: PublishingDocument, pageId: string) => {
  let currentPage = document.pages.find((page) => page.id === pageId);
  while (currentPage?.derivedFrom?.reason === 'auto-pagination') {
    const previousPage = document.pages.find((page) => page.id === currentPage?.derivedFrom?.previousPageId);
    if (!previousPage) {
      break;
    }
    currentPage = previousPage;
  }
  return currentPage?.id ?? pageId;
};

export const getFlowStartZoneId = (document: PublishingDocument, masterId: string, zoneId: string) => {
  const master = document.masters.items.find((item) => item.id === masterId);
  const zone = master?.contentZones.find((item) => item.id === zoneId);
  if (!master || !zone) {
    return zoneId;
  }

  if (!zone.flowGroupId) {
    return zone.id;
  }

  return (
    sortFlowZonesForReadingOrder(
      master.contentZones.filter((item) => item.kind === 'text-flow' && item.flowGroupId === zone.flowGroupId),
    )[0]?.id
    ?? zone.id
  );
};

export const findZoneForContributionSlot = (
  document: PublishingDocument,
  masterId: string,
  slotKey: string,
) => {
  const master = document.masters.items.find((item) => item.id === masterId);
  if (!master) {
    return null;
  }

  const normalizedSlotKey = slotKey.toLowerCase();
  const baseSlotKey = normalizedSlotKey.replace(/_(ko|en)$/, '');

  return (
    master.contentZones.find((zone) => zone.kind === 'text-flow' && inferZoneSlotKey(zone)?.toLowerCase() === normalizedSlotKey)
    ?? master.contentZones.find((zone) => zone.kind === 'text-flow' && inferZoneSlotKey(zone)?.toLowerCase() === baseSlotKey)
    ?? master.contentZones.find((zone) => zone.kind === 'text-flow' && zone.name.toLowerCase().includes(baseSlotKey))
    ?? (baseSlotKey.startsWith('body')
      ? master.contentZones.find((zone) => zone.kind === 'text-flow' && inferZoneSlotKey(zone)?.toLowerCase() === 'body')
      : null)
    ?? master.contentZones.find((zone) => zone.kind === 'text-flow')
    ?? null
  );
};

export const findThreadForContributionSlot = (
  document: PublishingDocument,
  contribution: ContributionItem,
  slotKey: string,
) => {
  const zone = findZoneForContributionSlot(document, contribution.masterId, slotKey);
  if (!zone) {
    return document.threads.find((thread) => thread.sourcePageId === contribution.pageId) ?? null;
  }

  const startZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
  return document.threads.find((thread) =>
    thread.sourcePageId === contribution.pageId
    && thread.sourceZoneId === startZoneId,
  ) ?? null;
};

const createThreadSegmentBlock = (
  thread: PublishingDocument['threads'][number],
  segmentIndex: number,
  text: string,
): Extract<PublishingDocument['pages'][number]['zones'][number]['blocks'][number], { type: 'text' }> => ({
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
    isTerminal: true,
  },
  content: {
    runs: [{ text }],
  },
  styleOverride: thread.styleOverride,
  ebook: thread.ebook,
});

const getContributionChainPages = (document: PublishingDocument, contributionPageId: string) =>
  document.pages.filter((page) => getChainRootPageId(document, page.id) === contributionPageId);

const estimateCharsPerPage = (
  document: PublishingDocument,
  masterId: string,
  slotKey: string,
) => {
  const master = document.masters.items.find((item) => item.id === masterId);
  if (!master) {
    return 1800;
  }

  const normalizedSlotKey = slotKey.toLowerCase().replace(/_(ko|en)$/, '');
  const zones = master.contentZones.filter((zone) => {
    const inferred = inferZoneSlotKey(zone)?.toLowerCase() ?? '';
    return zone.kind === 'text-flow' && (inferred === slotKey.toLowerCase() || inferred === normalizedSlotKey);
  });

  const targetZones = zones.length ? zones : master.contentZones.filter((zone) => zone.kind === 'text-flow');
  const area = targetZones.reduce((sum, zone) => sum + (zone.frame.width * zone.frame.height), 0);
  const style = targetZones[0]?.style ?? createMainBodyZone().style;
  const denominator = Math.max(1, style.fontSize * style.fontSize * style.lineHeight * 0.55);
  return Math.max(900, Math.floor(area / denominator));
};

const splitTextByCapacity = (text: string, capacity: number) => {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= capacity) {
    return [normalized];
  }

  const segments: string[] = [];
  let remaining = normalized;

  while (remaining.length > capacity) {
    let cutIndex = remaining.lastIndexOf('\n\n', capacity);
    if (cutIndex < capacity * 0.45) {
      cutIndex = remaining.lastIndexOf('. ', capacity);
    }
    if (cutIndex < capacity * 0.45) {
      cutIndex = remaining.lastIndexOf(' ', capacity);
    }
    if (cutIndex < capacity * 0.45) {
      cutIndex = capacity;
    }

    const segment = remaining.slice(0, cutIndex).trim();
    if (segment) {
      segments.push(segment);
    }
    remaining = remaining.slice(cutIndex).trim();
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments;
};

export const normalizeContributionOrder = (document: PublishingDocument) => {
  document.contributions = (document.contributions ?? [])
    .map((contribution, index) => ({
      ...contribution,
      order: index + 1,
    }));

  if (!document.contributions.length) {
    document.pages = document.pages.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    }));
    return;
  }

  const contributionRootPageIds = new Set(document.contributions.map((contribution) => contribution.pageId));
  const fixedPages = document.pages.filter((page) => !contributionRootPageIds.has(getChainRootPageId(document, page.id)));
  const orderedContributionPages = document.contributions.flatMap((contribution) =>
    document.pages.filter((page) => getChainRootPageId(document, page.id) === contribution.pageId),
  );

  document.pages = [...fixedPages, ...orderedContributionPages].map((page, index) => ({
    ...page,
    pageNumber: index + 1,
  }));
};

export const rebuildContributionLayout = (
  document: PublishingDocument,
  contribution: ContributionItem,
  createPageFromMaster: (
    documentState: PublishingDocument,
    masterId: string,
    pageNumber: number,
  ) => PublishingDocument['pages'][number] | null,
) => {
  const master = document.masters.items.find((item) => item.id === contribution.masterId);
  const rootPage = document.pages.find((page) => page.id === contribution.pageId);
  if (!master || !rootPage) {
    return document;
  }

  const chainPages = getContributionChainPages(document, contribution.pageId);
  const chainPageIds = new Set(chainPages.map((page) => page.id));
  const contributionThreads = document.threads.filter((thread) => thread.sourcePageId === contribution.pageId);

  document.pages.forEach((page) => {
    page.zones.forEach((zone) => {
      zone.blocks = zone.blocks.filter((block) =>
        block.type !== 'text'
        || !contributionThreads.some((thread) => thread.id === block.flow.sourceThreadId),
      );
    });
  });

  document.pages = document.pages.filter((page) => page.id === contribution.pageId || !chainPageIds.has(page.id));
  rootPage.zones = master.contentZones.map((zone) => ({ zoneId: zone.id, blocks: [] }));

  const pagesByOffset: PublishingDocument['pages'] = [rootPage];
  const ensurePageAtOffset = (offset: number) => {
    while (pagesByOffset.length <= offset) {
      const previousPage = pagesByOffset[pagesByOffset.length - 1];
      const page = createPageFromMaster(document, contribution.masterId, document.pages.length + 1);
      if (!page) {
        break;
      }
      page.derivedFrom = {
        previousPageId: previousPage.id,
        reason: 'auto-pagination',
      };
      document.pages.push(page);
      pagesByOffset.push(page);
    }
    return pagesByOffset[offset];
  };

  if (master.mode === 'speaker-thread') {
    const renderSlotOnPage = (slot: ContributionItem['slots'][number], pageOffset: number) => {
      const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
      const zone = findZoneForContributionSlot(document, contribution.masterId, slot.slotKey);
      if (!thread || !zone) {
        return;
      }

      const page = ensurePageAtOffset(pageOffset);
      if (!page) {
        return;
      }

      const startZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
      const pageZone = page.zones.find((item) => item.zoneId === startZoneId);
      if (!pageZone) {
        return;
      }

      const block = createThreadSegmentBlock(thread, 0, slot.text);
      pageZone.blocks.push(block);
      thread.zoneSequence = [{ pageId: page.id, zoneId: startZoneId }];
    };

    const renderBodyOnPageChain = (slot: ContributionItem['slots'][number], startOffset: number) => {
      const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
      const zone = findZoneForContributionSlot(document, contribution.masterId, slot.slotKey);
      if (!thread || !zone) {
        return 1;
      }

      const startZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
      const capacity = estimateCharsPerPage(document, contribution.masterId, slot.slotKey);
      const segments = splitTextByCapacity(slot.text, capacity);
      thread.zoneSequence = [];

      if (!segments.length) {
        return 1;
      }

      segments.forEach((segmentText, index) => {
        const page = ensurePageAtOffset(startOffset + index);
        if (!page) {
          return;
        }

        const pageZone = page.zones.find((item) => item.zoneId === startZoneId);
        if (!pageZone) {
          return;
        }

        const block = createThreadSegmentBlock(thread, index, segmentText);
        block.flow.isTerminal = index === segments.length - 1;
        pageZone.blocks.push(block);
        thread.zoneSequence.push({ pageId: page.id, zoneId: startZoneId });
      });

      return Math.max(1, segments.length);
    };

    const trackSlot = contribution.slots.find((slot) => slot.slotKey === 'track');
    const koSlots = contribution.slots.filter((slot) => slot.slotKey.endsWith('_ko'));
    const enSlots = contribution.slots.filter((slot) => slot.slotKey.endsWith('_en'));
    const hasKo = koSlots.some((slot) => slot.text.trim());
    const hasEn = enSlots.some((slot) => slot.text.trim());
    const pageLanguages: Array<'ko' | 'en'> = [];
    if (hasKo) pageLanguages.push('ko');
    if (hasEn) pageLanguages.push('en');

    if (pageLanguages.length) {
      let currentOffset = 0;

      pageLanguages.forEach((language) => {
        const pageOffset = currentOffset;
        const slots = language === 'ko' ? koSlots : enSlots;
        const bodySlotKey = language === 'ko' ? 'body_ko' : 'body_en';
        const bodySlot = slots.find((slot) => slot.slotKey === bodySlotKey);
        const frontmatterSlots = slots.filter((slot) => slot.slotKey !== bodySlotKey);

        if (trackSlot?.text.trim()) {
          renderSlotOnPage(trackSlot, pageOffset);
        }

        frontmatterSlots.forEach((slot) => renderSlotOnPage(slot, pageOffset));
        const pagesConsumed = bodySlot ? renderBodyOnPageChain(bodySlot, pageOffset) : 1;
        currentOffset += pagesConsumed;
      });

      normalizeContributionOrder(document);
      return document;
    }
  }

  const bodySlots = contribution.slots
    .filter((slot) => slot.slotKey.startsWith('body'))
    .sort((left, right) => {
      const order = ['body_ko', 'body', 'body_en'];
      const leftIndex = order.indexOf(left.slotKey);
      const rightIndex = order.indexOf(right.slotKey);
      return (leftIndex >= 0 ? leftIndex : order.length) - (rightIndex >= 0 ? rightIndex : order.length);
    });
  const frontmatterSlots = contribution.slots.filter((slot) => !slot.slotKey.startsWith('body'));

  frontmatterSlots.forEach((slot) => {
    const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
    const zone = findZoneForContributionSlot(document, contribution.masterId, slot.slotKey);
    if (!thread || !zone) {
      return;
    }
    const startZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
    const pageZone = rootPage.zones.find((item) => item.zoneId === startZoneId);
    if (!pageZone) {
      return;
    }
    const block = createThreadSegmentBlock(thread, 0, slot.text);
    pageZone.blocks.push(block);
    thread.zoneSequence = [{ pageId: rootPage.id, zoneId: startZoneId }];
  });

  let currentOffset = 0;
  bodySlots.forEach((slot, slotIndex) => {
    const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
    const zone = findZoneForContributionSlot(document, contribution.masterId, slot.slotKey);
    if (!thread || !zone) {
      return;
    }

    const startZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
    const capacity = estimateCharsPerPage(document, contribution.masterId, slot.slotKey);
    const segments = splitTextByCapacity(slot.text, capacity);
    thread.zoneSequence = [];

    segments.forEach((segmentText, index) => {
      const pageOffset = currentOffset + index;
      const page = ensurePageAtOffset(pageOffset);
      if (!page) {
        return;
      }
      const pageZone = page.zones.find((item) => item.zoneId === startZoneId);
      if (!pageZone) {
        return;
      }
      const block = createThreadSegmentBlock(thread, index, segmentText);
      block.flow.isTerminal = index === segments.length - 1;
      pageZone.blocks.push(block);
      thread.zoneSequence.push({ pageId: page.id, zoneId: startZoneId });
    });

    if (segments.length > 0) {
      const pagesConsumed = Math.max(1, segments.length);
      currentOffset += pagesConsumed;
    } else if (slotIndex < bodySlots.length - 1) {
      currentOffset += 1;
    }
  });

  normalizeContributionOrder(document);
  return document;
};
