import { createMainBodyZone } from '@/lib/publishing/defaultDocument';
import { ContributionItem, PublishingDocument, TextRun } from '@/types/publishing';

const FLOW_ROW_THRESHOLD_PX = 24;
const DEFAULT_LAYOUT_RETRY_SCALES = [1, 0.82, 0.68] as const;
const CJK_REGEX = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3040-\u30ff\u3400-\u9fff]/g;
const LATIN_REGEX = /[A-Za-z]/g;

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

import { splitRunsByTexts } from '@/lib/publishing/richText';

const createThreadSegmentBlock = (
  thread: PublishingDocument['threads'][number],
  segmentIndex: number,
  runs: TextRun[],
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
    runs,
  },
  styleOverride: thread.styleOverride,
  ebook: thread.ebook,
});

const getContributionChainPages = (document: PublishingDocument, contributionPageId: string) =>
  document.pages.filter((page) => getChainRootPageId(document, page.id) === contributionPageId);

const countMatches = (value: string, pattern: RegExp) => value.match(pattern)?.length ?? 0;

const getTextDensityProfile = (sampleText: string, slotKey: string) => {
  const normalizedText = sampleText.trim();
  const cjkCount = countMatches(normalizedText, CJK_REGEX);
  const latinCount = countMatches(normalizedText, LATIN_REGEX);
  const paragraphCount = Math.max(
    1,
    normalizedText
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean).length,
  );

  if (!normalizedText) {
    return {
      averageCharWidthEm: slotKey.includes('_en') ? 0.55 : 1.02,
      fillRatio: slotKey.startsWith('body') ? 0.58 : 0.76,
      paragraphPenalty: 0.96,
    };
  }

  const totalMeasuredChars = Math.max(1, cjkCount + latinCount);
  const cjkRatio = cjkCount / totalMeasuredChars;
  const averageCharWidthEm = cjkRatio >= 0.45 ? 1.02 : 0.55;
  const baseFillRatio = slotKey.startsWith('body')
    ? (cjkRatio >= 0.45 ? 0.58 : 0.58) // Use same fill ratio for English to prevent unexpected pagination
    : 0.78;
  const paragraphPenalty = Math.max(0.72, 1 - (paragraphCount - 1) * 0.04);

  return {
    averageCharWidthEm,
    fillRatio: baseFillRatio,
    paragraphPenalty,
  };
};

export const estimateCharsPerPage = (
  document: PublishingDocument,
  masterId: string,
  slotKey: string,
  sampleText = '',
  capacityScale = 1,
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
  const fallbackStyle = targetZones[0]?.style ?? createMainBodyZone().style;
  const fallbackPadding = targetZones[0]?.constraints.padding ?? createMainBodyZone().constraints.padding;
  const density = getTextDensityProfile(sampleText, normalizedSlotKey);

  const estimatedCapacity = targetZones.reduce((sum, zone) => {
    const style = zone.style ?? fallbackStyle;
    const padding = zone.constraints.padding ?? fallbackPadding;
    const usableWidth = Math.max(48, zone.frame.width - padding.left - padding.right);
    const usableHeight = Math.max(48, zone.frame.height - padding.top - padding.bottom);
    const lineHeightPx = Math.max(1, style.fontSize * style.lineHeight);
    const estimatedLineCount = Math.max(1, Math.floor(usableHeight / lineHeightPx));
    const charsPerLine = Math.max(8, usableWidth / Math.max(1, style.fontSize * density.averageCharWidthEm));
    return sum + Math.floor(estimatedLineCount * charsPerLine);
  }, 0);

  return Math.max(700, Math.floor(estimatedCapacity * density.fillRatio * density.paragraphPenalty * capacityScale));
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

interface RebuildContributionLayoutOptions {
  capacityScale?: number;
  maxRetries?: number;
}

const shouldRetryContributionLayout = (
  document: PublishingDocument,
  contribution: ContributionItem,
  capacityScale: number,
) => contribution.slots.some((slot) => {
  const master = document.masters.items.find((item) => item.id === contribution.masterId);
  if (master?.mode === 'speaker-thread') {
    return false;
  }

  if (!slot.slotKey.startsWith('body') || !slot.text.trim()) {
    return false;
  }

  const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
  if (!thread || thread.zoneSequence.length > 1) {
    return false;
  }

  const estimatedCapacity = estimateCharsPerPage(
    document,
    contribution.masterId,
    slot.slotKey,
    slot.text,
    capacityScale,
  );

  return slot.text.trim().length > estimatedCapacity * 1.08;
});

const rebuildContributionLayoutOnce = (
  document: PublishingDocument,
  contribution: ContributionItem,
  createPageFromMaster: (
    documentState: PublishingDocument,
    masterId: string,
    pageNumber: number,
  ) => PublishingDocument['pages'][number] | null,
  options: RebuildContributionLayoutOptions = {},
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

  const preservedRootBlocks = new Map(
    rootPage.zones.map((zone) => [
      zone.zoneId,
      zone.blocks.filter((block) =>
        block.type !== 'text'
        || !contributionThreads.some((thread) => thread.id === block.flow.sourceThreadId),
      ),
    ]),
  );
  const validZoneIds = new Set(master.contentZones.map((zone) => zone.id));

  document.pages = document.pages.filter((page) => page.id === contribution.pageId || !chainPageIds.has(page.id));
  rootPage.zones = [
    ...master.contentZones.map((zone) => ({
      zoneId: zone.id,
      blocks: preservedRootBlocks.get(zone.id) ?? [],
    })),
    ...rootPage.zones
      .filter((zone) => !validZoneIds.has(zone.zoneId))
      .map((zone) => ({
        zoneId: zone.zoneId,
        blocks: preservedRootBlocks.get(zone.zoneId) ?? [],
      }))
      .filter((zone) => zone.blocks.length > 0),
  ];

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
    const renderSlotOnPage = (slot: ContributionItem['slots'][number], pageOffset: number, isCommon = false) => {
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

      // Prevent duplicate rendering of the same thread on the same page
      if (pageZone.blocks.some((b) => b.type === 'text' && b.flow.sourceThreadId === thread.id)) {
        return;
      }

      const segmentRuns = splitRunsByTexts(thread.canonicalText, [slot.text]);
      const segmentIndex = isCommon ? thread.zoneSequence.length : 0;
      const block = createThreadSegmentBlock(thread, segmentIndex, segmentRuns[0] ?? thread.canonicalText);
      pageZone.blocks.push(block);
      
      if (isCommon) {
        thread.zoneSequence.push({ pageId: page.id, zoneId: startZoneId });
      } else {
        thread.zoneSequence = [{ pageId: page.id, zoneId: startZoneId }];
      }
    };

    const renderBodyOnSinglePage = (slot: ContributionItem['slots'][number], pageOffset: number) => {
      const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
      const zone = findZoneForContributionSlot(document, contribution.masterId, slot.slotKey);
      if (!thread || !zone) {
        return 1;
      }

      const page = ensurePageAtOffset(pageOffset);
      if (!page) {
        return 1;
      }

      const startZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
      const pageZone = page.zones.find((item) => item.zoneId === startZoneId);
      if (!pageZone) {
        return 1;
      }

      // Check if block for this thread already exists on this page to prevent duplicate rendering
      if (pageZone.blocks.some((b) => b.type === 'text' && b.flow.sourceThreadId === thread.id)) {
        return 1;
      }

      const segmentRuns = splitRunsByTexts(thread.canonicalText, [slot.text]);
      const block = createThreadSegmentBlock(thread, 0, segmentRuns[0] ?? thread.canonicalText);
      block.flow.isTerminal = true;
      pageZone.blocks.push(block);
      thread.zoneSequence = [{ pageId: page.id, zoneId: startZoneId }];
      return 1;
    };

    const koSlots = contribution.slots.filter((slot) => slot.slotKey.endsWith('_ko'));
    const enSlots = contribution.slots.filter((slot) => slot.slotKey.endsWith('_en'));
    const commonSlots = contribution.slots.filter((slot) => !slot.slotKey.endsWith('_ko') && !slot.slotKey.endsWith('_en'));
    const hasKo = koSlots.some((slot) => slot.text.trim());
    const hasEn = enSlots.some((slot) => slot.text.trim());
    const pageLanguages: Array<'ko' | 'en'> = [];
    if (hasKo) pageLanguages.push('ko');
    if (hasEn) pageLanguages.push('en');

    if (pageLanguages.length) {
      let currentOffset = 0;

      commonSlots.forEach((slot) => {
        const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
        if (thread) {
          thread.zoneSequence = [];
          
          // Clean up existing common blocks from all pages to prevent duplication
          pagesByOffset.forEach(page => {
            page.zones.forEach(zone => {
              zone.blocks = zone.blocks.filter(b => b.type !== 'text' || b.flow.sourceThreadId !== thread.id);
            });
          });
        }
      });

      pageLanguages.forEach((language) => {
        const pageOffset = currentOffset;
        const slots = language === 'ko' ? koSlots : enSlots;
        const bodySlotKey = language === 'ko' ? 'body_ko' : 'body_en';
        const bodySlot = slots.find((slot) => slot.slotKey === bodySlotKey);
        const frontmatterSlots = slots.filter((slot) => slot.slotKey !== bodySlotKey);
        
        // Clean up existing language blocks from this page to prevent duplication
        const page = ensurePageAtOffset(pageOffset);
        if (page) {
          slots.forEach(slot => {
            const thread = findThreadForContributionSlot(document, contribution, slot.slotKey);
            if (thread) {
              page.zones.forEach(zone => {
                zone.blocks = zone.blocks.filter(b => b.type !== 'text' || b.flow.sourceThreadId !== thread.id);
              });
            }
          });
        }

        commonSlots.forEach((slot) => {
          // If the slot is track/session and it has no text, try to use the presentation track label
          let textToRender = slot.text;
          if (slot.slotKey === 'track' && !textToRender.trim() && contribution.presentationTrackId) {
            const trackOption = document.meta.presentationTracks?.find(t => t.id === contribution.presentationTrackId);
            if (trackOption) {
              textToRender = `${trackOption.prefix}. ${trackOption.label}`;
            }
          }
          
          const modifiedSlot = { ...slot, text: textToRender };
          renderSlotOnPage(modifiedSlot, pageOffset, true);
        });
        frontmatterSlots.forEach((slot) => renderSlotOnPage(slot, pageOffset));
        const pagesConsumed = bodySlot ? renderBodyOnSinglePage(bodySlot, pageOffset) : 1;
        currentOffset += pagesConsumed;
      });

      // After rendering, clean up any extra overflow pages that might have been left behind from a previous layout
      const usedPageIds = pagesByOffset.slice(0, currentOffset).map(p => p.id);
      const allContributionPageIds = pagesByOffset.map(p => p.id);
      
      document.pages = document.pages.filter(p => 
        !allContributionPageIds.includes(p.id) || usedPageIds.includes(p.id)
      );

      // Also clean up any threads that might belong to the discarded pages
      const discardedPageIds = allContributionPageIds.filter(id => !usedPageIds.includes(id));
      if (discardedPageIds.length > 0) {
        document.threads = document.threads.filter(thread => {
          if (contribution.slots.some(slot => findThreadForContributionSlot(document, contribution, slot.slotKey)?.id === thread.id)) {
            return true;
          }
          return !discardedPageIds.includes(thread.sourcePageId);
        });
      }

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
    let textToRender = slot.text;
    if (slot.slotKey === 'track' && !textToRender.trim() && contribution.presentationTrackId) {
      const trackOption = document.meta.presentationTracks?.find(t => t.id === contribution.presentationTrackId);
      if (trackOption) {
        textToRender = `${trackOption.prefix}. ${trackOption.label}`;
      }
    }

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
    const segmentRuns = splitRunsByTexts(thread.canonicalText, [textToRender]);
    const block = createThreadSegmentBlock(thread, 0, segmentRuns[0] ?? thread.canonicalText);
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
    const capacity = estimateCharsPerPage(
      document,
      contribution.masterId,
      slot.slotKey,
      slot.text,
      options.capacityScale ?? 1,
    );
    const segments = splitTextByCapacity(slot.text, capacity);
    const segmentRuns = splitRunsByTexts(thread.canonicalText, segments);
    thread.zoneSequence = [];

    // Clean up existing blocks for this thread across all pages
    pagesByOffset.forEach(page => {
      page.zones.forEach(pageZone => {
        pageZone.blocks = pageZone.blocks.filter(b => b.type !== 'text' || b.flow.sourceThreadId !== thread.id);
      });
    });

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
      const block = createThreadSegmentBlock(thread, index, segmentRuns[index] ?? [{ text: segmentText }]);
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

  // After rendering, clean up any extra overflow pages that might have been left behind from a previous layout
  const usedPageIds = pagesByOffset.slice(0, currentOffset === 0 ? 1 : currentOffset).map(p => p.id);
  const allContributionPageIds = pagesByOffset.map(p => p.id);
  
  // Update document.pages: keep pages that are NOT part of this contribution's chain,
  // OR pages that ARE part of the chain but were actually used (usedPageIds)
  document.pages = document.pages.filter(p => 
    !allContributionPageIds.includes(p.id) || usedPageIds.includes(p.id)
  );

  // Also clean up any threads that might belong to the discarded pages
  const discardedPageIds = allContributionPageIds.filter(id => !usedPageIds.includes(id));
  if (discardedPageIds.length > 0) {
    document.threads = document.threads.filter(thread => {
      // Don't remove the main contribution threads themselves
      if (contribution.slots.some(slot => findThreadForContributionSlot(document, contribution, slot.slotKey)?.id === thread.id)) {
        return true;
      }
      return !discardedPageIds.includes(thread.sourcePageId);
    });
  }

  normalizeContributionOrder(document);
  return document;
};

export const rebuildContributionLayout = (
  document: PublishingDocument,
  contribution: ContributionItem,
  createPageFromMaster: (
    documentState: PublishingDocument,
    masterId: string,
    pageNumber: number,
  ) => PublishingDocument['pages'][number] | null,
  options: RebuildContributionLayoutOptions = {},
) => {
  const retryScales = DEFAULT_LAYOUT_RETRY_SCALES
    .map((scale, index) => (index === 0 ? options.capacityScale ?? 1 : scale * (options.capacityScale ?? 1)))
    .slice(0, Math.max(1, options.maxRetries ?? DEFAULT_LAYOUT_RETRY_SCALES.length));

  retryScales.some((scale, attemptIndex) => {
    rebuildContributionLayoutOnce(document, contribution, createPageFromMaster, { ...options, capacityScale: scale });
    const needsRetry = shouldRetryContributionLayout(document, contribution, scale);

    if (needsRetry && attemptIndex < retryScales.length - 1) {
      console.warn(
        `[pagination] retrying contribution layout for ${contribution.id} (${contribution.title || 'untitled'}) `
        + `attempt ${attemptIndex + 2}/${retryScales.length}`,
      );
    } else if (needsRetry) {
      console.warn(
        `[pagination] contribution layout may still be incomplete for ${contribution.id} `
        + `after ${retryScales.length} attempts`,
      );
    }

    return !needsRetry;
  });

  return document;
};

export const rebuildAllContributionLayouts = (
  document: PublishingDocument,
  createPageFromMaster: (
    documentState: PublishingDocument,
    masterId: string,
    pageNumber: number,
  ) => PublishingDocument['pages'][number] | null,
  options: RebuildContributionLayoutOptions = {},
) => {
  document.contributions.forEach((contribution) => {
    const existingRootPage = document.pages.find((page) => page.id === contribution.pageId);
    if (!existingRootPage) {
      const rootPage = createPageFromMaster(document, contribution.masterId, document.pages.length + 1);
      if (!rootPage) {
        console.warn(`[pagination] missing master for contribution ${contribution.id}`);
        return;
      }

      rootPage.id = contribution.pageId;
      document.pages.push(rootPage);
    }

    rebuildContributionLayout(document, contribution, createPageFromMaster, options);
  });

  normalizeContributionOrder(document);
  return document;
};
