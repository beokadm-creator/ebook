import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PublishingStore } from '../publishingStore';
import * as Utils from './utils';

export interface PageSlice {
  selectPage: (pageId: string) => void;
  selectBlock: (pageId: string, zoneId: string, blockId: string) => void;
  addPage: (masterId?: string) => void;
  deletePage: (pageId: string) => void;
  updatePageMaster: (pageId: string, masterId: string) => void;
}

export const createPageSlice: StateCreator<PublishingStore, [], [], PageSlice> = (set) => ({
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
      const nextDocument = produce(state.document, (draft) => {
        const currentPageMasterId = state.selection.pageId
          ? draft.pages.find((page) => page.id === state.selection.pageId)?.masterId
          : null;
        const resolvedMasterId = masterId ?? currentPageMasterId ?? draft.masters.defaultMasterId;
        const master = draft.masters.items.find((item) => item.id === resolvedMasterId)
          ?? draft.masters.items.find((item) => item.id === draft.masters.defaultMasterId)
          ?? draft.masters.items[0];
        if (!master) {
          return;
        }

        const newPageId = Utils.createId('page');
        const newPageNumber = draft.pages.length + 1;
        draft.pages.push({
          id: newPageId,
          pageNumber: newPageNumber,
          masterId: master.id,
          pageRole: 'body',
          derivedFrom: {
            previousPageId: state.selection.pageId ?? draft.pages.at(-1)?.id ?? newPageId,
            reason: 'manual-duplicate',
          },
          zones: master.contentZones.map((zone) => ({
            zoneId: zone.id,
            blocks: [],
          })),
        });

        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const master = nextDocument.masters.items.find((item) => item.id === nextDocument.pages.at(-1)?.masterId);
      const newPageId = nextDocument.pages.at(-1)!.id;
      const next = Utils.pushHistoryEntry(state, `Add page ${newPageId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        selection: {
          pageId: newPageId,
          zoneId: master?.contentZones[0]?.id ?? null,
          blockId: null,
        },
        ...next,
      };
    }),

  deletePage: (pageId) =>
    set((state) => {
      let trimmedThreadIds: string[] = [];
      let invalidatedThreadIdsArray: string[] = [];
      const nextDocument = produce(state.document, (draft) => {
        const pageIndex = draft.pages.findIndex((page) => page.id === pageId);
        const page = draft.pages[pageIndex];
        if (!page || draft.pages.length <= 1 || page.pageRole === 'cover') {
          return;
        }

        const pageThreadIds = new Set(
          page.zones.flatMap((zone) =>
            zone.blocks
              .filter((block): block is Extract<typeof zone.blocks[number], { type: 'text' }> => block.type === 'text')
              .map((block) => block.flow.sourceThreadId),
          ),
        );

        if (page.derivedFrom?.reason === 'auto-pagination') {
          pageThreadIds.forEach((threadId) => {
            if (Utils.trimThreadFromPage(draft, threadId, pageId)) {
              trimmedThreadIds.push(threadId);
            }
          });

          draft.pages.splice(pageIndex, 1);
          draft.pages = draft.pages.map((item, index) => ({
            ...item,
            pageNumber: index + 1,
          }));
          draft.threads.forEach((thread) => {
            thread.zoneSequence = thread.zoneSequence.filter((item) => item.pageId !== pageId);
          });
          Utils.syncTocFromThreads(draft);
          draft.meta.updatedAt = new Date().toISOString();
          return;
        }

        draft.pages.splice(pageIndex, 1);
        draft.pages = draft.pages.map((item, index) => ({
          ...item,
          pageNumber: index + 1,
        }));

        const invalidatedThreadIds = new Set<string>(state.pagination.invalidatedThreadIds);
        draft.threads = draft.threads.filter((thread) => {
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
        invalidatedThreadIdsArray = Array.from(invalidatedThreadIds);

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const pageIndex = state.document.pages.findIndex((page) => page.id === pageId);
      const page = state.document.pages[pageIndex];

      if (page?.derivedFrom?.reason === 'auto-pagination') {
        const fallbackPage =
          nextDocument.pages
            .filter((candidate) => candidate.pageNumber < page.pageNumber)
            .at(-1)
          ?? nextDocument.pages[0];
        const next = Utils.pushHistoryEntry(state, `Trim overflow page ${pageId}`, nextDocument);

        return {
          ...state,
          document: nextDocument,
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

      const fallbackPage = nextDocument.pages[Math.max(0, pageIndex - 1)] ?? nextDocument.pages[0];
      const next = Utils.pushHistoryEntry(state, `Delete page ${pageId}`, nextDocument);

      return {
        ...state,
        document: nextDocument,
        selection: {
          pageId: fallbackPage?.id ?? null,
          zoneId: fallbackPage?.zones[0]?.zoneId ?? null,
          blockId: null,
        },
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: invalidatedThreadIdsArray,
        },
        ...next,
      };
    }),

  updatePageMaster: (pageId, masterId) =>
    set((state) => {
      let invalidatedThreadIdsArray: string[] = [];
      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!page || !master) {
          return;
        }

        page.masterId = masterId;
        const primaryFlowZone =
          master.contentZones
            .filter((zone) => zone.kind === 'text-flow')
            .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]
          ?? master.contentZones[0];

        if (primaryFlowZone) {
          draft.threads.forEach((thread) => {
            const isPageThread = thread.zoneSequence.some((item) => item.pageId === pageId) || thread.sourcePageId === pageId;
            if (isPageThread) {
              thread.sourceZoneId = primaryFlowZone.id;
              if (thread.sourcePageId === pageId) {
                thread.zoneSequence = [{ pageId, zoneId: primaryFlowZone.id }];
              }
            }
          });
        }

        draft.meta.updatedAt = new Date().toISOString();
        invalidatedThreadIdsArray = draft.threads.filter((thread) => thread.sourcePageId === pageId).map((thread) => thread.id);
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update page master ${pageId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...invalidatedThreadIdsArray,
        ]),
      );

      return {
        ...state,
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        ...next,
      };
    }),
});