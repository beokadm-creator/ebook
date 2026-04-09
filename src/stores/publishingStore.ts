import { create } from 'zustand';
import { createImageZone, createInitialPublishingDocument, createMainBodyZone, getThreadPlainText } from '@/lib/publishing/defaultDocument';
import { applyThreadPaginationSegments, PaginationSegmentPlacement, repaginateDocument } from '@/lib/publishing/pagination';
import { applyPresetToMaster, TemplatePresetKey } from '@/lib/publishing/templatePresets';
import {
  HistoryEntry,
  PublishingDocument,
  PublishingEditorState,
  TextRole,
  TextRun,
  TypographyStyle,
} from '@/types/publishing';

interface PublishingStore extends PublishingEditorState {
  initialize: (document?: PublishingDocument) => void;
  selectPage: (pageId: string) => void;
  selectBlock: (pageId: string, zoneId: string, blockId: string) => void;
  addPage: (masterId?: string) => void;
  deletePage: (pageId: string) => void;
  createMaster: (name?: string, preset?: TemplatePresetKey) => void;
  duplicateMaster: (masterId: string) => void;
  deleteMaster: (masterId: string) => void;
  setDefaultMaster: (masterId: string) => void;
  renameMaster: (masterId: string, name: string) => void;
  updatePageMaster: (pageId: string, masterId: string) => void;
  applyTemplatePreset: (masterId: string, preset: TemplatePresetKey) => void;
  updateDocumentMeta: (titleKo: string, titleEn?: string) => void;
  updatePageNumbering: (updates: Partial<PublishingDocument['layout']['pageNumbering']>) => void;
  updatePrintGuides: (updates: Partial<PublishingDocument['layout']['printGuides']>) => void;
  updateMasterBackground: (masterId: string, fill: string) => void;
  toggleMasterLock: (masterId: string) => void;
  updateMasterDecoration: (
    masterId: string,
    decorationId: string,
    updates: Partial<{
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fill: string;
      style: Partial<TypographyStyle>;
    }>,
  ) => void;
  updateGlobalMasterDecoration: (
    masterId: string,
    decorationId: string,
    updates: Partial<{
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fill: string;
      style: Partial<TypographyStyle>;
    }>,
  ) => void;
  updateMasterZoneFrame: (
    masterId: string,
    zoneId: string,
    updates: Partial<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>,
  ) => void;
  updateMasterZoneStyle: (
    masterId: string,
    zoneId: string,
    updates: Partial<TypographyStyle>,
  ) => void;
  updateMasterZoneMeta: (
    masterId: string,
    zoneId: string,
    updates: Partial<{
      name: string;
      slotKey?: string;
      flowGroupId?: string;
      flowOrder?: number;
      allowThreadContinuation?: boolean;
    }>,
  ) => void;
  addMasterTextDecoration: (masterId: string) => void;
  addMasterShapeDecoration: (masterId: string) => void;
  addMasterImageDecoration: (
    masterId: string,
    image: {
      src: string;
      naturalWidth: number;
      naturalHeight: number;
      storagePath?: string;
    },
  ) => void;
  removeMasterDecoration: (masterId: string, decorationId: string) => void;
  toggleMasterDecorationLock: (masterId: string, decorationId: string) => void;
  toggleMasterZoneLock: (masterId: string, zoneId: string) => void;
  addMasterTextZone: (masterId: string) => void;
  addMasterImageZone: (masterId: string) => void;
  removeMasterZone: (masterId: string, zoneId: string) => void;
  updateThreadText: (threadId: string, text: string) => void;
  updateThreadRuns: (threadId: string, runs: TextRun[]) => void;
  updateThreadRole: (threadId: string, role: TextRole) => void;
  updateThreadStyleOverride: (
    threadId: string,
    updates: Partial<NonNullable<PublishingDocument['threads'][number]['styleOverride']>>,
  ) => void;
  toggleThreadToc: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  addThread: (pageId: string, zoneId: string, role?: TextRole) => void;
  addThreadWithText: (pageId: string, zoneId: string, text: string, role?: TextRole) => string | null;
  addThreadsFromParsedContent: (pageId: string, threads: Array<{ text: string; role: TextRole }>) => string[];
  addImageBlock: (
    pageId: string,
    zoneId: string,
    image: {
      src: string;
      naturalWidth: number;
      naturalHeight: number;
      storagePath?: string;
    },
  ) => void;
  updateImageBlock: (
    pageId: string,
    zoneId: string,
    blockId: string,
    updates: Partial<{
      placement: {
        x: number;
        y: number;
        width: number;
        height: number;
        zIndex: number;
        rotation: number;
      };
      crop: {
        originX: number;
        originY: number;
        width: number;
        height: number;
      };
    }>,
  ) => void;
  toggleBlockLock: (pageId: string, zoneId: string, blockId: string) => void;
  applyPaginationResult: (threadId: string, segments: PaginationSegmentPlacement[]) => void;
  repaginateInvalidatedThreads: () => void;
  handleThreadOverflow: (threadId: string, overflowText: string, overflowStartOffset: number) => void;
  markSaving: () => void;
  markSaved: () => void;
  markSaveFailed: (message: string) => void;
  undo: () => void;
  redo: () => void;
}

const AUTOSAVE_DEBOUNCE_MS = 1200;

let autosaveTimer: number | null = null;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FLOW_ROW_THRESHOLD_PX = 24;

const sortFlowZonesForReadingOrder = <T extends { frame: { x: number; y: number } }>(zones: T[]) =>
  [...zones].sort((left, right) => {
    if (Math.abs(left.frame.y - right.frame.y) > FLOW_ROW_THRESHOLD_PX) {
      return left.frame.y - right.frame.y;
    }
    return left.frame.x - right.frame.x;
  });

const inferZoneSlotKey = (zone?: { id: string; name?: string; kind?: string; slotKey?: string }) => {
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

const normalizeMasterFlowGroups = (master: PublishingDocument['masters']['items'][number]) => {
  const flowGroups = new Map<string, PublishingDocument['masters']['items'][number]['contentZones']>();

  master.contentZones.forEach((zone) => {
    const inferredSlotKey = inferZoneSlotKey(zone);
    if (inferredSlotKey && !zone.slotKey) {
      zone.slotKey = inferredSlotKey;
    }

    if (!zone.flowGroupId) {
      return;
    }

    const group = flowGroups.get(zone.flowGroupId) ?? [];
    group.push(zone);
    flowGroups.set(zone.flowGroupId, group);
  });

  flowGroups.forEach((zones, flowGroupId) => {
    const slotKeys = Array.from(new Set(zones.map((zone) => inferZoneSlotKey(zone) ?? zone.id)));
    if (slotKeys.length <= 1) {
      return;
    }

    zones.forEach((zone) => {
      const slotKey = inferZoneSlotKey(zone) ?? zone.id;
      zone.flowGroupId = `${flowGroupId}:${slotKey}`;
      zone.flowOrder = undefined;
      if (slotKey !== 'body') {
        zone.allowThreadContinuation = false;
      }
    });
  });

  const groupedZones = new Map<string, PublishingDocument['masters']['items'][number]['contentZones']>();
  master.contentZones.forEach((zone) => {
    if (!zone.flowGroupId) {
      return;
    }
    const group = groupedZones.get(zone.flowGroupId) ?? [];
    group.push(zone);
    groupedZones.set(zone.flowGroupId, group);
  });

  groupedZones.forEach((zones) => {
    sortFlowZonesForReadingOrder(zones).forEach((zone, index) => {
      zone.flowOrder = index + 1;
    });
  });
};

const getPrimaryFlowZoneId = (document: PublishingDocument, masterId: string) => {
  const master = document.masters.items.find((item) => item.id === masterId);
  return (
    sortFlowZonesForReadingOrder(
      master?.contentZones.filter((zone) => zone.kind === 'text-flow') ?? [],
    )[0]?.id
    ?? master?.contentZones[0]?.id
    ?? null
  );
};

const getChainRootPageId = (document: PublishingDocument, pageId: string) => {
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

const getFlowStartZoneId = (document: PublishingDocument, masterId: string, zoneId: string) => {
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
      master.contentZones.filter((item) => item.kind === 'text-flow' && item.flowGroupId === zone.flowGroupId && item.allowThreadContinuation !== false),
    )[0]?.id
    ?? zone.id
  );
};

const getThreadSlotKey = (document: PublishingDocument, thread: PublishingDocument['threads'][number]) => {
  const sourcePage = document.pages.find((page) => page.id === thread.sourcePageId);
  if (!sourcePage) {
    return `${thread.sourcePageId}:zone:${thread.sourceZoneId}`;
  }

  const rootPageId = getChainRootPageId(document, sourcePage.id);
  const master = document.masters.items.find((item) => item.id === sourcePage.masterId);
  const sourceZone = master?.contentZones.find((zone) => zone.id === thread.sourceZoneId);
  const inferredSlotKey = inferZoneSlotKey(sourceZone);
  const slotKey = inferredSlotKey
    ? `slot:${inferredSlotKey}`
    : sourceZone?.flowGroupId
      ? `group:${sourceZone.flowGroupId}`
      : `zone:${thread.sourceZoneId}`;
  return `${rootPageId}:${slotKey}`;
};

const findExistingThreadForSlot = (
  document: PublishingDocument,
  pageId: string,
  zoneId: string,
) => {
  const page = document.pages.find((item) => item.id === pageId);
  if (!page) {
    return null;
  }

  const rootPageId = getChainRootPageId(document, pageId);
  const master = document.masters.items.find((item) => item.id === page.masterId);
  const resolvedZoneId = getFlowStartZoneId(document, page.masterId, zoneId);
  const zone = master?.contentZones.find((item) => item.id === resolvedZoneId)
    ?? master?.contentZones.find((item) => item.id === zoneId);
  if (!zone) {
    return null;
  }

  const slotKey = zone.flowGroupId ? `group:${zone.flowGroupId}` : `zone:${zone.id}`;
  const inferredSlotKey = inferZoneSlotKey(zone);
  const resolvedSlotKey = inferredSlotKey ? `slot:${inferredSlotKey}` : slotKey;
  return document.threads.find((thread) => {
    const threadPage = document.pages.find((item) => item.id === thread.sourcePageId);
    if (!threadPage) {
      return false;
    }

    const threadRootPageId = getChainRootPageId(document, thread.sourcePageId);
    if (threadRootPageId !== rootPageId) {
      return false;
    }

    const threadMaster = document.masters.items.find((item) => item.id === threadPage.masterId);
    const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
    const threadInferredSlotKey = inferZoneSlotKey(threadZone);
    const threadSlotKey = threadInferredSlotKey
      ? `slot:${threadInferredSlotKey}`
      : threadZone?.flowGroupId
        ? `group:${threadZone.flowGroupId}`
        : `zone:${thread.sourceZoneId}`;
    return threadSlotKey === resolvedSlotKey;
  }) ?? null;
};

const renameZoneForMaster = (zone: PublishingDocument['masters']['items'][number]['contentZones'][number]) => ({
  ...zone,
  id: createId(zone.id || 'zone'),
});

const getRoleStyleOverride = (role: TextRole) => {
  switch (role) {
    case 'title':
      return { fontSize: 30, fontWeight: 700, lineHeight: 1.4, textAlign: 'center' as const };
    case 'heading':
      return { fontSize: 24, fontWeight: 700, lineHeight: 1.45, textAlign: 'left' as const };
    case 'subheading':
      return { fontSize: 18, fontWeight: 700, lineHeight: 1.5, textAlign: 'left' as const };
    case 'quote':
      return { fontSize: 16, fontWeight: 400, lineHeight: 1.9, textAlign: 'left' as const };
    case 'caption':
      return { fontSize: 12, fontWeight: 400, lineHeight: 1.6, textAlign: 'center' as const };
    default:
      return undefined;
  }
};

const findTextBlockByThreadId = (document: PublishingDocument, threadId: string) => {
  for (const page of document.pages) {
    for (const zone of page.zones) {
      for (const block of zone.blocks) {
        if (block.type === 'text' && block.flow.sourceThreadId === threadId && block.flow.segmentIndex === 0) {
          return { page, zone, block };
        }
      }
    }
  }

  return null;
};

const getZonesInSameFlowGroup = (
  master: PublishingDocument['masters']['items'][number],
  zone: PublishingDocument['masters']['items'][number]['contentZones'][number],
) => {
  if (!zone.flowGroupId) {
    return [zone];
  }

  return master.contentZones.filter((item) => item.flowGroupId === zone.flowGroupId);
};

const mergeRuns = (runs: TextRun[]) => {
  if (!runs.length) {
    return [{ text: '' }] as TextRun[];
  }

  const merged: TextRun[] = [];
  runs.forEach((run) => {
    const previous = merged[merged.length - 1];
    const sameMarks = JSON.stringify(previous?.marks ?? {}) === JSON.stringify(run.marks ?? {});
    if (previous && sameMarks) {
      previous.text += run.text;
      return;
    }
    merged.push({ text: run.text, marks: run.marks ? { ...run.marks } : undefined });
  });
  return merged;
};

const trimThreadFromPage = (document: PublishingDocument, threadId: string, pageId: string) => {
  const thread = document.threads.find((item) => item.id === threadId);
  if (!thread) {
    return false;
  }

  const allSegments = document.pages
    .flatMap((page) =>
      page.zones.flatMap((zone) =>
        zone.blocks
          .filter((block): block is Extract<typeof zone.blocks[number], { type: 'text' }> => block.type === 'text' && block.flow.sourceThreadId === threadId)
          .map((block) => ({
            pageId: page.id,
            segmentIndex: block.flow.segmentIndex,
            runs: block.content.runs,
          })),
      ),
    )
    .sort((left, right) => left.segmentIndex - right.segmentIndex);

  const firstRemovedSegmentIndex = allSegments.find((segment) => segment.pageId === pageId)?.segmentIndex;
  if (firstRemovedSegmentIndex === undefined) {
    return false;
  }

  const keptRuns = allSegments
    .filter((segment) => segment.segmentIndex < firstRemovedSegmentIndex)
    .flatMap((segment) => segment.runs);

  if (!keptRuns.length) {
    document.threads = document.threads.filter((item) => item.id !== threadId);
    return true;
  }

  thread.canonicalText = mergeRuns(keptRuns);
  thread.zoneSequence = thread.zoneSequence.filter((item) => item.pageId !== pageId);
  return true;
};

const syncTocFromThreads = (document: PublishingDocument) => {
  document.toc.items = [];

  document.threads.forEach((thread) => {
    const isHeading = thread.semanticRole === 'heading' || thread.semanticRole === 'subheading';
    if (!isHeading || !thread.ebook.toc.enabled) {
      return;
    }

    const resolved = findTextBlockByThreadId(document, thread.id);
    if (!resolved) {
      return;
    }

    const labelKo = thread.canonicalText.map((run) => run.text).join('').trim() || '제목 없음';
    const level = thread.semanticRole === 'heading' ? 1 : 2;
    const tocId = thread.ebook.toc.tocId || `toc_${thread.id}`;

    resolved.block.ebook.toc = {
      enabled: true,
      tocId,
      level,
      label: {
        ko: labelKo,
        en: thread.ebook.toc.label?.en || '',
      },
    };

    document.toc.items.push({
      id: tocId,
      label: {
        ko: labelKo,
        en: thread.ebook.toc.label?.en || '',
      },
      level,
      source: {
        pageId: resolved.page.id,
        blockId: resolved.block.id,
        threadId: thread.id,
      },
      ebookAnchor: tocId,
    });
  });
};

const sanitizePublishingDocument = (document: PublishingDocument): PublishingDocument => {
  const nextDocument = clone(document);

  nextDocument.masters.items = nextDocument.masters.items
    .filter((master) => Boolean(master))
    .map((master) => ({
      ...master,
      decorations: (master.decorations ?? []).filter((decoration) => Boolean(decoration)),
      contentZones: (master.contentZones ?? []).filter((zone) => Boolean(zone?.id) && Boolean(zone?.frame)),
    }));

  nextDocument.masters.items.forEach((master) => {
    normalizeMasterFlowGroups(master);
  });

  nextDocument.pages = nextDocument.pages
    .filter((page) => Boolean(page))
    .map((page) => {
      const master = nextDocument.masters.items.find((item) => item.id === page.masterId);
      const validZoneIds = new Set((master?.contentZones ?? []).map((zone) => zone.id));
      const existingZones = (page.zones ?? []).filter((zone) => {
        if (!zone) {
          return false;
        }

        if (validZoneIds.has(zone.zoneId)) {
          return true;
        }

        return (zone.blocks ?? []).some((block) => block?.type === 'image');
      });

      const masterZones = (master?.contentZones ?? []).map((zoneTemplate) => {
        const matchedZone = existingZones.find((zone) => zone.zoneId === zoneTemplate.id);
        return {
          zoneId: zoneTemplate.id,
          blocks: (matchedZone?.blocks ?? []).filter((block) => Boolean(block)),
        };
      });

      const detachedImageZones = existingZones
        .filter((zone) => !validZoneIds.has(zone.zoneId))
        .map((zone) => ({
          ...zone,
          blocks: (zone.blocks ?? []).filter((block) => Boolean(block)),
        }));

      return {
        ...page,
        zones: [...masterZones, ...detachedImageZones],
      };
    });

  nextDocument.threads = (nextDocument.threads ?? [])
    .filter((thread) => Boolean(thread))
    .map((thread) => {
      const sourcePage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
      if (!sourcePage) {
        // 초기 로드시 스레드만 설정하고 페이지네이션은 DOM useEffect에서 처리
      return thread;
      }

      const rootPageId = getChainRootPageId(nextDocument, sourcePage.id);
      const normalizedSourceZoneId = getFlowStartZoneId(nextDocument, sourcePage.masterId, thread.sourceZoneId);
      return {
        ...thread,
        sourcePageId: rootPageId,
        sourceZoneId: normalizedSourceZoneId,
        zoneSequence: [{ pageId: rootPageId, zoneId: normalizedSourceZoneId }],
      };
    });

  nextDocument.threads.forEach((thread) => {
    const sourcePage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
    const master = sourcePage ? nextDocument.masters.items.find((item) => item.id === sourcePage.masterId) : null;
    const sourceZone = master?.contentZones.find((zone) => zone.id === thread.sourceZoneId);
    const sourceSlotKey = inferZoneSlotKey(sourceZone);

    if (thread.semanticRole === 'paragraph' && sourceSlotKey && sourceSlotKey !== 'body') {
      const bodyZone = sortFlowZonesForReadingOrder(master?.contentZones.filter((zone) => inferZoneSlotKey(zone) === 'body') ?? [])[0];
      if (bodyZone) {
        thread.sourceZoneId = bodyZone.id;
        thread.zoneSequence = [{ pageId: thread.sourcePageId, zoneId: bodyZone.id }];
      }
    }
  });
  const mergedThreads = new Map<string, PublishingDocument['threads'][number]>();
  nextDocument.threads.forEach((thread) => {
    const slotKey = getThreadSlotKey(nextDocument, thread);
    const existing = mergedThreads.get(slotKey);
    if (!existing) {
      mergedThreads.set(slotKey, thread);
      return;
    }

    if (existing.canonicalText.length && thread.canonicalText.length) {
      existing.canonicalText = [...existing.canonicalText, { text: '\n\n' }, ...thread.canonicalText];
    } else if (thread.canonicalText.length) {
      existing.canonicalText = [...existing.canonicalText, ...thread.canonicalText];
    }
  });
  nextDocument.threads = Array.from(mergedThreads.values());
  nextDocument.assets = (nextDocument.assets ?? []).filter((asset) => Boolean(asset));
  nextDocument.toc.items = (nextDocument.toc.items ?? []).filter((item) => Boolean(item));

  if (!nextDocument.threads.length) {
    return nextDocument;
  }

  // 페이지네이션은 DOM 기반(paginateThreadWithDom)에서만 수행
  // 추정 기반 repaginateDocument는 렌더링 정확도가 떨어지므로 제거
  syncTocFromThreads(nextDocument);
  return nextDocument;
};

const pushHistoryEntry = (
  state: PublishingStore,
  label: string,
  documentOverride?: PublishingDocument,
): Partial<PublishingStore> => {
  const snapshot = clone(documentOverride ?? state.document);
  const entry: HistoryEntry = {
    revision: state.history.revision,
    label,
    timestamp: new Date().toISOString(),
    document: snapshot,
  };

  return {
    history: {
      revision: state.history.revision + 1,
      undoStack: [...state.history.undoStack, entry].slice(-50),
      redoStack: [],
    },
    autosave: {
      ...state.autosave,
      dirty: true,
      pendingRevision: state.history.revision + 1,
      lastError: null,
    },
  };
};

const createStoreState = (document?: PublishingDocument): PublishingEditorState => ({
  document: document ?? createInitialPublishingDocument('draft-publication'),
  selection: {
    pageId: null,
    zoneId: null,
    blockId: null,
  },
  history: {
    revision: 1,
    undoStack: [],
    redoStack: [],
  },
  autosave: {
    dirty: false,
    isSaving: false,
    lastSavedAt: null,
    lastError: null,
    pendingRevision: null,
  },
  pagination: {
    invalidatedThreadIds: [],
    isPaginating: false,
    lastPaginatedAt: null,
  },
});

export const usePublishingStore = create<PublishingStore>()((set) => ({
  ...createStoreState(),

  initialize: (document) =>
    set(() => {
      const state = createStoreState(document ? sanitizePublishingDocument(document) : document);
      return {
        ...state,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: state.document.threads.map((thread) => thread.id),
        },
      };
    }),

  selectPage: (pageId) =>
    set((state) => ({
      selection: {
        pageId,
        zoneId: state.selection.pageId === pageId ? state.selection.zoneId : null,
        blockId: state.selection.pageId === pageId ? state.selection.blockId : null,
      },
    })),

  selectBlock: (pageId, zoneId, blockId) =>
    set(() => ({
      selection: { pageId, zoneId, blockId },
    })),

  addPage: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const currentPageMasterId = state.selection.pageId
        ? nextDocument.pages.find((page) => page.id === state.selection.pageId)?.masterId
        : null;
      const resolvedMasterId = masterId ?? currentPageMasterId ?? nextDocument.masters.defaultMasterId;
      const master = nextDocument.masters.items.find((item) => item.id === resolvedMasterId)
        ?? nextDocument.masters.items.find((item) => item.id === nextDocument.masters.defaultMasterId)
        ?? nextDocument.masters.items[0];
      if (!master) {
        return state;
      }

      const newPageId = createId('page');
      const newPageNumber = nextDocument.pages.length + 1;
      nextDocument.pages.push({
        id: newPageId,
        pageNumber: newPageNumber,
        masterId: master.id,
        pageRole: 'body',
        derivedFrom: {
          previousPageId: state.selection.pageId ?? nextDocument.pages.at(-1)?.id ?? newPageId,
          reason: 'manual-duplicate',
        },
        zones: master.contentZones.map((zone) => ({
          zoneId: zone.id,
          blocks: [],
        })),
      });

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add page ${newPageId}`, nextDocument);
      return {
        document: nextDocument,
        selection: {
          pageId: newPageId,
          zoneId: master.contentZones[0]?.id ?? null,
          blockId: null,
        },
        ...next,
      };
    }),

  deletePage: (pageId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const pageIndex = nextDocument.pages.findIndex((page) => page.id === pageId);
      const page = nextDocument.pages[pageIndex];
      if (!page || nextDocument.pages.length <= 1 || page.pageRole === 'cover') {
        return state;
      }

      const pageThreadIds = new Set(
        page.zones.flatMap((zone) =>
          zone.blocks
            .filter((block): block is Extract<typeof zone.blocks[number], { type: 'text' }> => block.type === 'text')
            .map((block) => block.flow.sourceThreadId),
        ),
      );

      if (page.derivedFrom?.reason === 'auto-pagination') {
        const trimmedThreadIds: string[] = [];
        pageThreadIds.forEach((threadId) => {
          if (trimThreadFromPage(nextDocument, threadId, pageId)) {
            trimmedThreadIds.push(threadId);
          }
        });

        const repaginated = repaginateDocument(
          nextDocument,
          nextDocument.threads.map((thread) => thread.id),
        );
        syncTocFromThreads(repaginated);
        repaginated.meta.updatedAt = new Date().toISOString();
        const fallbackPage =
          repaginated.pages
            .filter((candidate) => candidate.pageNumber < page.pageNumber)
            .at(-1)
          ?? repaginated.pages[0];
        const next = pushHistoryEntry(state, `Trim overflow page ${pageId}`, repaginated);

        return {
          document: repaginated,
          selection: {
            pageId: fallbackPage?.id ?? null,
            zoneId: fallbackPage?.zones[0]?.zoneId ?? null,
            blockId: null,
          },
          pagination: {
            ...state.pagination,
            invalidatedThreadIds: state.pagination.invalidatedThreadIds.filter((id) => !trimmedThreadIds.includes(id)),
          },
          ...next,
        };
      }

      nextDocument.pages.splice(pageIndex, 1);
      nextDocument.pages = nextDocument.pages.map((item, index) => ({
        ...item,
        pageNumber: index + 1,
      }));

      const invalidatedThreadIds = new Set<string>(state.pagination.invalidatedThreadIds);
      nextDocument.threads = nextDocument.threads.filter((thread) => {
        if (thread.sourcePageId === pageId) {
          return false;
        }

        const hadSegmentOnPage = thread.zoneSequence.some((item) => item.pageId === pageId);
        if (hadSegmentOnPage || pageThreadIds.has(thread.id)) {
          thread.zoneSequence = thread.zoneSequence.filter((item) => item.pageId !== pageId);
          invalidatedThreadIds.add(thread.id);
        }
        return true;
      });

      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const fallbackPage = nextDocument.pages[Math.max(0, pageIndex - 1)] ?? nextDocument.pages[0];
      const next = pushHistoryEntry(state, `Delete page ${pageId}`, nextDocument);

      return {
        document: nextDocument,
        selection: {
          pageId: fallbackPage?.id ?? null,
          zoneId: fallbackPage?.zones[0]?.zoneId ?? null,
          blockId: null,
        },
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: Array.from(invalidatedThreadIds),
        },
        ...next,
      };
    }),

  createMaster: (name, preset = 'single-column') =>
    set((state) => {
      const nextDocument = clone(state.document);
      const newMasterId = createId('master');
      const bodyLikeMaster = nextDocument.masters.items.find((item) => item.id === nextDocument.masters.defaultMasterId)
        ?? nextDocument.masters.items.find((item) => item.id === 'master_body')
        ?? nextDocument.masters.items[0];

      const newMaster = bodyLikeMaster
        ? {
            ...clone(bodyLikeMaster),
            id: newMasterId,
            name: name || `New Master ${nextDocument.masters.items.length + 1}`,
            locked: false,
            decorations: clone(bodyLikeMaster.decorations).map((decoration) => ({
              ...decoration,
              id: createId('decoration'),
            })),
            contentZones: clone(bodyLikeMaster.contentZones).map((zone) => renameZoneForMaster(zone)),
          }
        : {
            id: newMasterId,
            name: name || `New Master ${nextDocument.masters.items.length + 1}`,
            scope: 'global' as const,
            locked: false,
            background: { fill: '#ffffff', image: null },
            decorations: [],
            contentZones: [{ ...createMainBodyZone(), id: createId('zone') }],
          };

      applyPresetToMaster(newMaster, preset);
      newMaster.contentZones = newMaster.contentZones.map((zone) => renameZoneForMaster(zone));

      nextDocument.masters.items.push(newMaster);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Create master ${newMaster.id}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  renameMaster: (masterId, name) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || !name.trim()) {
        return state;
      }

      master.name = name.trim();
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Rename master ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  duplicateMaster: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master) {
        return state;
      }

      const duplicatedMaster = clone(master);
      duplicatedMaster.id = createId('master');
      duplicatedMaster.name = `${master.name} Copy`;
      duplicatedMaster.locked = false;
      duplicatedMaster.decorations = duplicatedMaster.decorations.map((decoration) => ({
        ...decoration,
        id: createId('decoration'),
      }));
      duplicatedMaster.contentZones = duplicatedMaster.contentZones.map((zone) => renameZoneForMaster(zone));

      nextDocument.masters.items.push(duplicatedMaster);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Duplicate master ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  deleteMaster: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      if (nextDocument.masters.items.length <= 1) {
        return state;
      }

      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master) {
        return state;
      }

      const fallbackMaster = nextDocument.masters.items.find((item) => item.id !== masterId);
      if (!fallbackMaster) {
        return state;
      }

      const affectedPageIds = nextDocument.pages.filter((page) => page.masterId === masterId).map((page) => page.id);
      nextDocument.masters.items = nextDocument.masters.items.filter((item) => item.id !== masterId);
      if (nextDocument.masters.defaultMasterId === masterId) {
        nextDocument.masters.defaultMasterId = fallbackMaster.id;
      }

      const fallbackZoneId = getPrimaryFlowZoneId(nextDocument, fallbackMaster.id);
      nextDocument.pages.forEach((page) => {
        if (page.masterId !== masterId) {
          return;
        }

        page.masterId = fallbackMaster.id;
        fallbackMaster.contentZones.forEach((zone) => {
          if (!page.zones.some((pageZone) => pageZone.zoneId === zone.id)) {
            page.zones.push({ zoneId: zone.id, blocks: [] });
          }
        });
      });

      if (fallbackZoneId) {
        nextDocument.threads.forEach((thread) => {
          const affected = thread.zoneSequence.some((item) =>
            nextDocument.pages.some((page) => page.id === item.pageId && page.masterId === fallbackMaster.id),
          ) || nextDocument.pages.some((page) => page.id === thread.sourcePageId && page.masterId === fallbackMaster.id);
          if (affected) {
            thread.sourceZoneId = fallbackZoneId;
          }
        });
      }

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Delete master ${masterId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...nextDocument.threads
            .filter((thread) => affectedPageIds.includes(thread.sourcePageId) || thread.zoneSequence.some((item) => affectedPageIds.includes(item.pageId)))
            .map((thread) => thread.id),
        ]),
      );
      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  setDefaultMaster: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      if (!nextDocument.masters.items.some((item) => item.id === masterId)) {
        return state;
      }

      nextDocument.masters.defaultMasterId = masterId;
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Set default master ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updatePageMaster: (pageId, masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const page = nextDocument.pages.find((item) => item.id === pageId);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!page || !master) {
        return state;
      }

      page.masterId = masterId;
      const primaryFlowZone =
        master.contentZones
          .filter((zone) => zone.kind === 'text-flow')
          .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]
        ?? master.contentZones[0];

      if (primaryFlowZone) {
        nextDocument.threads.forEach((thread) => {
          const isPageThread = thread.zoneSequence.some((item) => item.pageId === pageId) || thread.sourcePageId === pageId;
          if (isPageThread) {
            thread.sourceZoneId = primaryFlowZone.id;
            if (thread.sourcePageId === pageId) {
              thread.zoneSequence = [{ pageId, zoneId: primaryFlowZone.id }];
            }
          }
        });
      }

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update page master ${pageId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...nextDocument.threads
            .filter((thread) => thread.sourcePageId === pageId)
            .map((thread) => thread.id),
        ]),
      );

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  applyTemplatePreset: (masterId, preset) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master) {
        return state;
      }

      applyPresetToMaster(master, preset);
      nextDocument.pages.forEach((page) => {
        if (page.masterId === masterId) {
          master.contentZones.forEach((zone) => {
            if (!page.zones.some((pageZone) => pageZone.zoneId === zone.id)) {
              page.zones.push({ zoneId: zone.id, blocks: [] });
            }
          });
          page.zones = page.zones.filter((pageZone) =>
            master.contentZones.some((zone) => zone.id === pageZone.zoneId) || pageZone.blocks.some((block) => block.type === 'image'),
          );
        }
      });

      const primaryFlowZone =
        master.contentZones
          .filter((zone) => zone.kind === 'text-flow')
          .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]
        ?? master.contentZones[0];

      nextDocument.threads.forEach((thread) => {
        const usesMaster = nextDocument.pages.some((page) => page.masterId === masterId && thread.zoneSequence.some((item) => item.pageId === page.id));
        if (usesMaster && primaryFlowZone) {
          thread.sourceZoneId = primaryFlowZone.id;
        }
      });

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Apply template preset ${preset}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...nextDocument.threads
            .filter((thread) =>
              nextDocument.pages.some((page) => page.masterId === masterId && (thread.sourcePageId === page.id || thread.zoneSequence.some((item) => item.pageId === page.id))),
            )
            .map((thread) => thread.id),
        ]),
      );

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateDocumentMeta: (titleKo, titleEn = '') =>
    set((state) => {
      const nextDocument = clone(state.document);
      nextDocument.meta.title = { ko: titleKo, en: titleEn };
      nextDocument.meta.updatedAt = new Date().toISOString();

      const next = pushHistoryEntry(state, 'Update document title', nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updatePageNumbering: (updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      nextDocument.layout.pageNumbering = {
        ...nextDocument.layout.pageNumbering,
        ...updates,
      };
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, 'Update page numbering', nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updatePrintGuides: (updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      nextDocument.layout.printGuides = {
        ...nextDocument.layout.printGuides,
        ...updates,
      };
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, 'Update print guides', nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updateMasterBackground: (masterId, fill) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.locked) {
        return state;
      }

      master.background.fill = fill;
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update master background ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  toggleMasterLock: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master) {
        return state;
      }

      master.locked = !master.locked;
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Toggle master lock ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updateMasterDecoration: (masterId, decorationId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const decoration = master?.decorations.find((item) => item.id === decorationId);
      if (!master || !decoration || decoration.scope === 'global-fixed' || decoration.locked) {
        return state;
      }

      const { style, ...restUpdates } = updates;
      Object.assign(decoration, restUpdates);
      if (style) {
        decoration.style = {
          ...(decoration.style ?? {}),
          ...style,
        };
      }
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update decoration ${decorationId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updateGlobalMasterDecoration: (masterId, decorationId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const decoration = master?.decorations.find((item) => item.id === decorationId);
      if (!master || !decoration || decoration.scope !== 'global-fixed') {
        return state;
      }

      const { style, ...restUpdates } = updates;
      Object.assign(decoration, restUpdates);
      if (style) {
        decoration.style = {
          ...(decoration.style ?? {}),
          ...style,
        };
      }

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Admin update global decoration ${decorationId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updateMasterZoneFrame: (masterId, zoneId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const zone = master?.contentZones.find((item) => item.id === zoneId);
      if (!master || !zone || zone.scope === 'global-fixed' || zone.locked) {
        return state;
      }

      zone.frame = {
        ...zone.frame,
        ...updates,
      };
      getZonesInSameFlowGroup(master, zone)
        .filter((item) => item.id !== zone.id)
        .forEach((siblingZone) => {
          siblingZone.frame = {
            ...siblingZone.frame,
            ...(updates.y !== undefined ? { y: zone.frame.y } : {}),
            ...(updates.width !== undefined ? { width: zone.frame.width } : {}),
            ...(updates.height !== undefined ? { height: zone.frame.height } : {}),
          };
        });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update zone frame ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => {
              const threadPage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
              const threadMaster = threadPage ? nextDocument.masters.items.find((item) => item.id === threadPage.masterId) : null;
              const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
              return threadZone?.flowGroupId
                ? threadZone.flowGroupId === zone.flowGroupId
                : thread.sourceZoneId === zoneId;
            })
            .map((thread) => thread.id)
            .concat(state.pagination.invalidatedThreadIds),
        ),
      );

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateMasterZoneStyle: (masterId, zoneId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const zone = master?.contentZones.find((item) => item.id === zoneId);
      if (!master || !zone || zone.scope === 'global-fixed' || zone.locked) {
        return state;
      }

      getZonesInSameFlowGroup(master, zone).forEach((groupZone) => {
        groupZone.style = {
          ...groupZone.style,
          ...updates,
        };
      });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update zone style ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => {
              const threadPage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
              const threadMaster = threadPage ? nextDocument.masters.items.find((item) => item.id === threadPage.masterId) : null;
              const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
              return threadZone?.flowGroupId
                ? threadZone.flowGroupId === zone.flowGroupId
                : thread.sourceZoneId === zoneId;
            })
            .map((thread) => thread.id)
            .concat(state.pagination.invalidatedThreadIds),
        ),
      );

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateMasterZoneMeta: (masterId, zoneId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const zone = master?.contentZones.find((item) => item.id === zoneId);
      if (!master || !zone || zone.scope === 'global-fixed' || zone.locked) {
        return state;
      }

      if (typeof updates.name === 'string' && updates.name.trim()) {
        zone.name = updates.name.trim();
      }
      if ('slotKey' in updates) {
        zone.slotKey = updates.slotKey?.trim() || undefined;
      }
      if ('flowGroupId' in updates) {
        zone.flowGroupId = updates.flowGroupId?.trim() || undefined;
      }
      if ('flowOrder' in updates) {
        zone.flowOrder = updates.flowOrder ? Math.max(1, updates.flowOrder) : undefined;
      }
      if ('allowThreadContinuation' in updates && typeof updates.allowThreadContinuation === 'boolean') {
        zone.allowThreadContinuation = updates.allowThreadContinuation;
      }

      getZonesInSameFlowGroup(master, zone)
        .filter((item) => item.id !== zone.id)
        .forEach((groupZone) => {
          if ('slotKey' in updates) {
            groupZone.slotKey = zone.slotKey;
          }
          if ('allowThreadContinuation' in updates && typeof updates.allowThreadContinuation === 'boolean') {
            groupZone.allowThreadContinuation = zone.allowThreadContinuation;
          }
        });

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update zone meta ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => {
              const threadPage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
              const threadMaster = threadPage ? nextDocument.masters.items.find((item) => item.id === threadPage.masterId) : null;
              const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
              return threadZone?.flowGroupId
                ? threadZone.flowGroupId === zone.flowGroupId
                : thread.sourceZoneId === zoneId;
            })
            .map((thread) => thread.id)
            .concat(state.pagination.invalidatedThreadIds),
        ),
      );

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  addMasterTextDecoration: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.locked) {
        return state;
      }

      master.decorations.push({
        id: `decoration_${Date.now()}`,
        type: 'text',
        locked: false,
        scope: 'template-fixed',
        x: 72,
        y: 72,
        width: 180,
        height: 28,
        text: '새 마스터 텍스트',
      });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add master text decoration ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  addMasterShapeDecoration: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.locked) {
        return state;
      }

      master.decorations.push({
        id: `decoration_${Date.now()}`,
        type: 'shape',
        locked: false,
        scope: 'template-fixed',
        x: 72,
        y: 120,
        width: 220,
        height: 2,
        shape: 'line',
        fill: '#cbd5e1',
      });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add master shape decoration ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  addMasterImageDecoration: (masterId, image) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.locked) {
        return state;
      }

      const assetId = `asset_${Date.now()}`;
      nextDocument.assets.push({
        id: assetId,
        type: 'image',
        src: image.src,
        storagePath: image.storagePath,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });

      master.decorations.push({
        id: `decoration_${Date.now()}`,
        type: 'image',
        locked: false,
        scope: 'template-fixed',
        x: 72,
        y: 40,
        width: 120,
        height: 48,
        assetId,
      });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add master image decoration ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  removeMasterDecoration: (masterId, decorationId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const decoration = master?.decorations.find((item) => item.id === decorationId);
      if (!master || !decoration || decoration.scope === 'global-fixed' || decoration.locked) {
        return state;
      }

      master.decorations = master.decorations.filter((item) => item.id !== decorationId);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Remove decoration ${decorationId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  toggleMasterDecorationLock: (masterId, decorationId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const decoration = master?.decorations.find((item) => item.id === decorationId);
      if (!master || !decoration || decoration.scope === 'global-fixed') {
        return state;
      }

      decoration.locked = !decoration.locked;
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Toggle decoration lock ${decorationId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  toggleMasterZoneLock: (masterId, zoneId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      const zone = master?.contentZones.find((item) => item.id === zoneId);
      if (!master || !zone || zone.scope === 'global-fixed') {
        return state;
      }

      zone.locked = !zone.locked;
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Toggle zone lock ${zoneId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  addMasterTextZone: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.locked) {
        return state;
      }

      const newZone = {
        ...createMainBodyZone(),
        id: createId('zone'),
        name: `Text Zone ${master.contentZones.filter((zone) => zone.kind === 'text-flow').length + 1}`,
        flowGroupId: undefined,
        flowOrder: undefined,
        frame: {
          x: 72,
          y: 120 + master.contentZones.length * 24,
          width: 300,
          height: 180,
        },
      };

      master.contentZones.push(newZone);
      nextDocument.pages.forEach((page) => {
        if (page.masterId === masterId && !page.zones.some((zone) => zone.zoneId === newZone.id)) {
          page.zones.push({ zoneId: newZone.id, blocks: [] });
        }
      });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add master text zone ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  addMasterImageZone: (masterId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.locked) {
        return state;
      }

      const newZone = {
        ...createImageZone(`Image Zone ${master.contentZones.filter((zone) => zone.kind === 'media-freeform').length + 1}`),
        id: createId('zone'),
        frame: {
          x: 390,
          y: 120 + master.contentZones.length * 24,
          width: 220,
          height: 180,
        },
      };

      master.contentZones.push(newZone);
      nextDocument.pages.forEach((page) => {
        if (page.masterId === masterId && !page.zones.some((zone) => zone.zoneId === newZone.id)) {
          page.zones.push({ zoneId: newZone.id, blocks: [] });
        }
      });
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add master image zone ${masterId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  removeMasterZone: (masterId, zoneId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const master = nextDocument.masters.items.find((item) => item.id === masterId);
      if (!master || master.contentZones.length <= 1) {
        return state;
      }

      const hasContent = nextDocument.pages.some((page) =>
        page.masterId === masterId && page.zones.some((zone) => zone.zoneId === zoneId && zone.blocks.length > 0),
      );
      if (hasContent) {
        return state;
      }

      master.contentZones = master.contentZones.filter((zone) => zone.id !== zoneId);
      nextDocument.pages.forEach((page) => {
        if (page.masterId === masterId) {
          page.zones = page.zones.filter((zone) => zone.zoneId !== zoneId);
        }
      });

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Remove master zone ${zoneId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  updateThreadText: (threadId, text) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const thread = nextDocument.threads.find((item) => item.id === threadId);
      if (!thread) {
        return state;
      }

      const runs: TextRun[] = text ? [{ text }] : [{ text: '' }];
      thread.canonicalText = runs;
      if (thread.ebook.toc.enabled) {
        thread.ebook.toc.label = {
          ko: text.trim() || '제목 없음',
          en: thread.ebook.toc.label?.en || '',
        };
      }
      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();

      const currentPlainText = getThreadPlainText(state.document, threadId);
      if (currentPlainText === text) {
        return state;
      }

      const next = pushHistoryEntry(state, `Update ${threadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, threadId]));

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateThreadRuns: (threadId, runs) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const thread = nextDocument.threads.find((item) => item.id === threadId);
      if (!thread) {
        return state;
      }

      thread.canonicalText = runs;
      const plainText = runs.map((run) => run.text).join('');
      if (thread.ebook.toc.enabled) {
        thread.ebook.toc.label = {
          ko: plainText.trim() || '제목 없음',
          en: thread.ebook.toc.label?.en || '',
        };
      }
      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update runs ${threadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, threadId]));

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateThreadRole: (threadId, role) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const thread = nextDocument.threads.find((item) => item.id === threadId);
      if (!thread) {
        return state;
      }

      thread.semanticRole = role;
      thread.styleOverride = getRoleStyleOverride(role);
      if (role === 'heading' || role === 'subheading') {
        thread.ebook.toc.enabled = true;
      }

      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update role ${threadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, threadId]));

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateThreadStyleOverride: (threadId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const thread = nextDocument.threads.find((item) => item.id === threadId);
      if (!thread) {
        return state;
      }

      thread.styleOverride = {
        ...(thread.styleOverride ?? {}),
        ...updates,
      };
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update typography ${threadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, threadId]));

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),

  toggleThreadToc: (threadId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const thread = nextDocument.threads.find((item) => item.id === threadId);
      if (!thread) {
        return state;
      }

      thread.ebook.toc.enabled = !thread.ebook.toc.enabled;
      if (thread.ebook.toc.enabled) {
        const text = thread.canonicalText.map((run) => run.text).join('').trim() || '제목 없음';
        thread.ebook.toc.tocId = thread.ebook.toc.tocId || `toc_${thread.id}`;
        thread.ebook.toc.level = thread.semanticRole === 'subheading' ? 2 : 1;
        thread.ebook.toc.label = { ko: text, en: thread.ebook.toc.label?.en || '' };
      }

      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Toggle toc ${threadId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  deleteThread: (threadId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const threadExists = nextDocument.threads.some((item) => item.id === threadId);
      if (!threadExists) {
        return state;
      }

      nextDocument.threads = nextDocument.threads.filter((item) => item.id !== threadId);
      const repaginated = repaginateDocument(nextDocument, nextDocument.threads.map((thread) => thread.id));
      syncTocFromThreads(repaginated);
      repaginated.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Delete thread ${threadId}`, repaginated);

      return {
        document: repaginated,
        selection:
          state.selection.blockId && state.document.pages.some((page) =>
            page.zones.some((zone) =>
              zone.blocks.some((block) => block.id === state.selection.blockId && block.type === 'text' && block.flow.sourceThreadId === threadId),
            ),
          )
            ? {
                pageId: state.selection.pageId,
                zoneId: state.selection.zoneId,
                blockId: null,
              }
            : state.selection,
        ...next,
      };
    }),

  addThread: (pageId, zoneId, role = 'paragraph') =>
    set((state) => {
      const nextDocument = clone(state.document);
      const newThreadId = `thread_${Date.now()}`;
      const newBlockId = `${newThreadId}_seg_000`;
      const page = nextDocument.pages.find((item) => item.id === pageId);
      if (!page) {
        return state;
      }
      const rootPageId = getChainRootPageId(nextDocument, pageId);
      const rootPage = nextDocument.pages.find((item) => item.id === rootPageId) ?? page;
      const resolvedZoneId = getFlowStartZoneId(nextDocument, rootPage.masterId, zoneId);
      const zone = rootPage.zones.find((item) => item.zoneId === resolvedZoneId) ?? rootPage.zones.find((item) => item.zoneId === zoneId);
      if (!zone) {
        return state;
      }

      const existingThread = findExistingThreadForSlot(nextDocument, rootPage.id, zone.zoneId);
      if (existingThread) {
        existingThread.canonicalText = [{ text: role === 'heading' ? '새 섹션 제목' : '새 문단을 입력하세요.' }];
        existingThread.styleOverride = getRoleStyleOverride(role);
        existingThread.semanticRole = role;
        syncTocFromThreads(nextDocument);
        nextDocument.meta.updatedAt = new Date().toISOString();
        const next = pushHistoryEntry(state, `Reset thread ${existingThread.id}`, nextDocument);
        const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, existingThread.id]));

        return {
          document: nextDocument,
          selection: {
            pageId: rootPage.id,
            zoneId: zone.zoneId,
            blockId: existingThread.originBlockId,
          },
          pagination: {
            ...state.pagination,
            invalidatedThreadIds,
          },
          ...next,
        };
      }

      nextDocument.threads.push({
        id: newThreadId,
        type: 'text-flow',
        canonicalText: [{ text: role === 'heading' ? '새 섹션 제목' : '새 문단을 입력하세요.' }],
        semanticRole: role,
        styleOverride: getRoleStyleOverride(role),
        ebook: {
          include: true,
          toc: {
            enabled: role === 'heading' || role === 'subheading',
          },
        },
        originBlockId: newBlockId,
        sourceZoneId: zone.zoneId,
        sourcePageId: rootPage.id,
        zoneSequence: [{ pageId: rootPage.id, zoneId: zone.zoneId }],
      });

      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, newThreadId]));
      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add thread ${newThreadId}`, nextDocument);

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        selection: {
          pageId: rootPage.id,
          zoneId: zone.zoneId,
          blockId: newBlockId,
        },
        ...next,
      };
    }),

  addThreadWithText: (pageId, zoneId, text, role = 'paragraph') => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return null;
    }

    const newThreadId = `thread_${Date.now()}`;

    set((state) => {
      const nextDocument = clone(state.document);
      const newBlockId = `${newThreadId}_seg_000`;
      const page = nextDocument.pages.find((item) => item.id === pageId);
      if (!page) {
        return state;
      }
      const rootPageId = getChainRootPageId(nextDocument, pageId);
      const rootPage = nextDocument.pages.find((item) => item.id === rootPageId) ?? page;
      const resolvedZoneId = getFlowStartZoneId(nextDocument, rootPage.masterId, zoneId);
      const zone = rootPage.zones.find((item) => item.zoneId === resolvedZoneId) ?? rootPage.zones.find((item) => item.zoneId === zoneId);
      if (!zone) {
        return state;
      }

      const existingThread = findExistingThreadForSlot(nextDocument, rootPage.id, zone.zoneId);
      if (existingThread) {
        existingThread.canonicalText = [{ text: trimmedText }];
        existingThread.styleOverride = getRoleStyleOverride(role);
        existingThread.semanticRole = role;
        syncTocFromThreads(nextDocument);
        nextDocument.meta.updatedAt = new Date().toISOString();
        const next = pushHistoryEntry(state, `Replace thread ${existingThread.id}`, nextDocument);
        const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, existingThread.id]));

        return {
          document: nextDocument,
          selection: {
            pageId: rootPage.id,
            zoneId: zone.zoneId,
            blockId: existingThread.originBlockId,
          },
          pagination: {
            ...state.pagination,
            invalidatedThreadIds,
          },
          ...next,
        };
      }

      nextDocument.threads.push({
        id: newThreadId,
        type: 'text-flow',
        canonicalText: [{ text: trimmedText }],
        semanticRole: role,
        styleOverride: getRoleStyleOverride(role),
        ebook: {
          include: true,
          toc: {
            enabled: role === 'heading' || role === 'subheading',
          },
        },
        originBlockId: newBlockId,
        sourceZoneId: zone.zoneId,
        sourcePageId: rootPage.id,
        zoneSequence: [{ pageId: rootPage.id, zoneId: zone.zoneId }],
      });

      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, newThreadId]));
      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add thread ${newThreadId}`, nextDocument);

      return {
        document: nextDocument,
        selection: {
          pageId: rootPage.id,
          zoneId: zone.zoneId,
          blockId: newBlockId,
        },
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    });

    return newThreadId;
  },

  addImageBlock: (pageId, zoneId, image) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const page = nextDocument.pages.find((item) => item.id === pageId);
      const zone = page?.zones.find((item) => item.zoneId === zoneId);
      const master = page ? nextDocument.masters.items.find((item) => item.id === page.masterId) : null;
      const zoneTemplate = master?.contentZones.find((item) => item.id === zoneId);
      if (!page || !zone || !zoneTemplate?.frame) {
        return state;
      }

      const assetId = `asset_${Date.now()}`;
      const blockId = `image_${Date.now()}`;
      const maxWidth = Math.max(80, zoneTemplate.frame.width);
      const maxHeight = Math.max(80, zoneTemplate.frame.height);
      const aspectRatio = image.naturalWidth / image.naturalHeight || 1;
      let width = Math.min(maxWidth, image.naturalWidth);
      let height = width / aspectRatio;

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      width = Math.min(width, maxWidth);
      height = Math.min(height, maxHeight);

      nextDocument.assets.push({
        id: assetId,
        type: 'image',
        src: image.src,
        storagePath: image.storagePath,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });

      zone.blocks.push({
        id: blockId,
        type: 'image',
        semanticRole: 'figure',
        locked: false,
        scope: 'page-editable',
        visible: true,
        placement: {
          x: Math.max(0, (zoneTemplate.frame.width - width) / 2),
          y: Math.max(0, (zoneTemplate.frame.height - height) / 2),
          width,
          height,
          zIndex: 10,
          rotation: 0,
        },
        crop: {
          mode: 'rect',
          originX: 0,
          originY: 0,
          width: 1,
          height: 1,
        },
        assetRef: {
          assetId,
          src: image.src,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        },
        caption: {
          ko: '이미지 캡션',
          en: '',
        },
        ebook: {
          include: true,
          toc: {
            enabled: false,
          },
          readingWidth: 'full',
        },
      });

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add image ${blockId}`, nextDocument);
      return {
        document: nextDocument,
        selection: {
          pageId,
          zoneId,
          blockId,
        },
        ...next,
      };
    }),

  updateImageBlock: (pageId, zoneId, blockId, updates) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const page = nextDocument.pages.find((item) => item.id === pageId);
      const zone = page?.zones.find((item) => item.zoneId === zoneId);
      const block = zone?.blocks.find((item) => item.id === blockId && item.type === 'image');
      if (!block || block.type !== 'image' || block.locked) {
        return state;
      }

      if (updates.placement) {
        block.placement = {
          ...block.placement,
          ...updates.placement,
        };
      }

      if (updates.crop) {
        const width = clamp(updates.crop.width ?? block.crop.width, 0.2, 1);
        const height = clamp(updates.crop.height ?? block.crop.height, 0.2, 1);
        block.crop = {
          ...block.crop,
          ...updates.crop,
          width,
          height,
          originX: clamp(updates.crop.originX ?? block.crop.originX, 0, 1 - width),
          originY: clamp(updates.crop.originY ?? block.crop.originY, 0, 1 - height),
        };
      }

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update image ${blockId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  toggleBlockLock: (pageId, zoneId, blockId) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const page = nextDocument.pages.find((item) => item.id === pageId);
      const zone = page?.zones.find((item) => item.zoneId === zoneId);
      const block = zone?.blocks.find((item) => item.id === blockId);
      if (!block) {
        return state;
      }

      block.locked = !block.locked;
      nextDocument.meta.updatedAt = new Date().toISOString();

      const next = pushHistoryEntry(state, `Toggle lock ${blockId}`, nextDocument);
      return {
        document: nextDocument,
        ...next,
      };
    }),

  applyPaginationResult: (threadId, segments) =>
    set((state) => {
      const nextDocument = applyThreadPaginationSegments(state.document, threadId, segments);
      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Apply pagination ${threadId}`, nextDocument);

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: state.pagination.invalidatedThreadIds.filter((id) => id !== threadId),
          lastPaginatedAt: new Date().toISOString(),
        },
        ...next,
      };
    }),

  repaginateInvalidatedThreads: () =>
    set((state) => {
      if (!state.pagination.invalidatedThreadIds.length) {
        return state;
      }

      const nextDocument = repaginateDocument(state.document, state.pagination.invalidatedThreadIds);
      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();

      const next = pushHistoryEntry(state, 'Repaginate threads', nextDocument);
      return {
        document: nextDocument,
        pagination: {
          invalidatedThreadIds: [],
          isPaginating: false,
          lastPaginatedAt: new Date().toISOString(),
        },
        ...next,
      };
    }),

  markSaving: () =>
    set((state) => ({
      autosave: {
        ...state.autosave,
        isSaving: true,
        lastError: null,
      },
    })),

  markSaved: () =>
    set((state) => ({
      autosave: {
        ...state.autosave,
        dirty: false,
        isSaving: false,
        pendingRevision: null,
        lastSavedAt: new Date().toISOString(),
      },
    })),

  markSaveFailed: (message) =>
    set((state) => ({
      autosave: {
        ...state.autosave,
        isSaving: false,
        lastError: message,
      },
    })),

  undo: () =>
    set((state) => {
      const entry = state.history.undoStack[state.history.undoStack.length - 1];
      if (!entry) {
        return state;
      }

      const currentDocument = clone(state.document);
      return {
        document: clone(entry.document),
        history: {
          revision: state.history.revision + 1,
          undoStack: state.history.undoStack.slice(0, -1),
          redoStack: [
            ...state.history.redoStack,
            {
              revision: state.history.revision,
              label: `Redo ${entry.label}`,
              timestamp: new Date().toISOString(),
              document: currentDocument,
            },
          ],
        },
        autosave: {
          ...state.autosave,
          dirty: true,
          pendingRevision: state.history.revision + 1,
        },
      };
    }),

  redo: () =>
    set((state) => {
      const entry = state.history.redoStack[state.history.redoStack.length - 1];
      if (!entry) {
        return state;
      }

      const currentDocument = clone(state.document);
      return {
        document: clone(entry.document),
        history: {
          revision: state.history.revision + 1,
          undoStack: [
            ...state.history.undoStack,
            {
              revision: state.history.revision,
              label: `Undo ${entry.label}`,
              timestamp: new Date().toISOString(),
              document: currentDocument,
            },
          ],
          redoStack: state.history.redoStack.slice(0, -1),
        },
        autosave: {
          ...state.autosave,
          dirty: true,
          pendingRevision: state.history.revision + 1,
        },
      };
    }),

  addThreadsFromParsedContent: (pageId, threads) => {
    const createdThreadIds: string[] = [];

    set((state) => {
      const nextDocument = clone(state.document);
      const page = nextDocument.pages.find((item) => item.id === pageId);
      if (!page) {
        return state;
      }

      const rootPageId = getChainRootPageId(nextDocument, pageId);
      const rootPage = nextDocument.pages.find((item) => item.id === rootPageId) ?? page;

      // 현재 페이지의 마스터에서 text-flow 존을 찾기
      const master = nextDocument.masters.items.find((m) => m.id === rootPage.masterId);
      if (!master) {
        return state;
      }

      const textFlowZones = master.contentZones.filter((zone) => zone.kind === 'text-flow');
      if (!textFlowZones.length) {
        return state;
      }

      // 각 thread에 대해 적절한 zone에 배치
      let zoneIndex = 0;
      const invalidatedThreadIds: string[] = [];

      for (const threadData of threads) {
        const newThreadId = `ai_thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newBlockId = `${newThreadId}_seg_000`;

        // zone 순환 (같은 thread는 연속으로 배치)
        const currentZone = textFlowZones[zoneIndex % textFlowZones.length];

        nextDocument.threads.push({
          id: newThreadId,
          type: 'text-flow',
          canonicalText: [{ text: threadData.text }],
          semanticRole: threadData.role,
          styleOverride: getRoleStyleOverride(threadData.role),
          ebook: {
            include: true,
            toc: {
              enabled: threadData.role === 'heading' || threadData.role === 'subheading',
            },
          },
          originBlockId: newBlockId,
          sourceZoneId: currentZone.id,
          sourcePageId: rootPage.id,
          zoneSequence: [{ pageId: rootPage.id, zoneId: currentZone.id }],
        });

        createdThreadIds.push(newThreadId);
        invalidatedThreadIds.push(newThreadId);
        zoneIndex++;
      }

      syncTocFromThreads(nextDocument);
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Add ${threads.length} AI-parsed threads`, nextDocument);

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: Array.from(new Set([...state.pagination.invalidatedThreadIds, ...invalidatedThreadIds])),
        },
        selection: state.selection,
        ...next,
      };
    });

    return createdThreadIds;
  },

  handleThreadOverflow: (threadId, overflowText, overflowStartOffset) => {
    set((state) => {
      const nextDocument = clone(state.document);
      const thread = nextDocument.threads.find((t) => t.id === threadId);
      if (!thread || !overflowText) {
        return state;
      }

      // 현재 thread의 텍스트를 오버플로우 지점에서 분할
      const fullText = thread.canonicalText.map((r) => r.text).join('');
      const beforeOverflow = fullText.slice(0, overflowStartOffset);
      const afterOverflow = overflowText;

      // 기존 thread는 오버플로우 전까지만 유지
      thread.canonicalText = [{ text: beforeOverflow }];

      // 같은 thread가 계속되는 경우: 현재 마스터로 새 페이지 생성
      const sourcePage = nextDocument.pages.find((p) => p.id === thread.sourcePageId);
      if (!sourcePage) {
        return state;
      }

      const newPageId = createId('page');
      const newPage: PublishingDocument['pages'][number] = {
        id: newPageId,
        pageNumber: Math.max(...nextDocument.pages.map(p => p.pageNumber)) + 1,
        masterId: sourcePage.masterId,
        pageRole: sourcePage.pageRole,
        zones: [],
        derivedFrom: {
          reason: 'auto-pagination',
          previousPageId: sourcePage.id,
        },
      };

      nextDocument.pages.push(newPage);

      // 오버플로우된 텍스트로 새 thread 생성
      const newThreadId = `${threadId}_overflow_${Date.now()}`;
      const newBlockId = `${newThreadId}_seg_000`;

      const newThread: PublishingDocument['threads'][number] = {
        id: newThreadId,
        type: 'text-flow',
        canonicalText: [{ text: afterOverflow }],
        semanticRole: thread.semanticRole,
        styleOverride: thread.styleOverride,
        ebook: thread.ebook,
        originBlockId: newBlockId,
        sourceZoneId: thread.sourceZoneId,
        sourcePageId: newPageId,
        zoneSequence: [{ pageId: newPageId, zoneId: thread.sourceZoneId }],
      };

      nextDocument.threads.push(newThread);

      const invalidatedThreadIds = Array.from(new Set([
        ...state.pagination.invalidatedThreadIds,
        threadId,
        newThreadId,
      ]));

      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Auto-paginate thread ${threadId}`, nextDocument);

      return {
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        selection: state.selection,
        ...next,
      };
    });
  },
}));

usePublishingStore.subscribe((state) => {
  if (!state.autosave.dirty) {
    return;
  }

  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
  }

  autosaveTimer = window.setTimeout(() => {
    const current = usePublishingStore.getState();

    window.localStorage.setItem(
      `publishing-draft:${current.document.id}`,
      JSON.stringify(current.document),
    );
  }, AUTOSAVE_DEBOUNCE_MS);
});
