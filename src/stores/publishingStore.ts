import { create } from 'zustand';
import { createInitialPublishingDocument, createMainBodyZone, getThreadPlainText } from '@/lib/publishing/defaultDocument';
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
  addMasterTextDecoration: (masterId: string) => void;
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
  updateThreadText: (threadId: string, text: string) => void;
  updateThreadRuns: (threadId: string, runs: TextRun[]) => void;
  updateThreadRole: (threadId: string, role: TextRole) => void;
  updateThreadStyleOverride: (
    threadId: string,
    updates: Partial<NonNullable<PublishingDocument['threads'][number]['styleOverride']>>,
  ) => void;
  toggleThreadToc: (threadId: string) => void;
  addThread: (pageId: string, zoneId: string, role?: TextRole) => void;
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

const getPrimaryFlowZoneId = (document: PublishingDocument, masterId: string) => {
  const master = document.masters.items.find((item) => item.id === masterId);
  return (
    master?.contentZones
      .filter((zone) => zone.kind === 'text-flow')
      .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]?.id
    ?? master?.contentZones[0]?.id
    ?? null
  );
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
    set(() => ({
      ...createStoreState(document),
    })),

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

      Object.assign(decoration, updates);
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
      nextDocument.meta.updatedAt = new Date().toISOString();
      const next = pushHistoryEntry(state, `Update zone frame ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => thread.sourceZoneId === zoneId)
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

  addThread: (pageId, zoneId, role = 'paragraph') =>
    set((state) => {
      const nextDocument = clone(state.document);
      const newThreadId = `thread_${Date.now()}`;
      const newBlockId = `${newThreadId}_seg_000`;
      const page = nextDocument.pages.find((item) => item.id === pageId);
      const zone = page?.zones.find((item) => item.zoneId === zoneId);
      if (!page || !zone) {
        return state;
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
        sourceZoneId: zoneId,
        sourcePageId: pageId,
        zoneSequence: [{ pageId, zoneId }],
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
        ...next,
      };
    }),

  addImageBlock: (pageId, zoneId, image) =>
    set((state) => {
      const nextDocument = clone(state.document);
      const page = nextDocument.pages.find((item) => item.id === pageId);
      const zone = page?.zones.find((item) => item.zoneId === zoneId);
      if (!page || !zone) {
        return state;
      }

      const assetId = `asset_${Date.now()}`;
      const blockId = `image_${Date.now()}`;
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
          x: 80,
          y: 120,
          width: 320,
          height: 220,
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
