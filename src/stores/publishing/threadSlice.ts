import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PublishingStore } from '../publishingStore';
import * as Utils from './utils';
import { PublishingDocument, TextRun, TextRole } from '@/types/publishing';
import { getChainRootPageId, getFlowStartZoneId } from '@/lib/publishing/contributionLayout';

export interface ThreadSlice {
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
}

export const createThreadSlice: StateCreator<PublishingStore, [], [], ThreadSlice> = (set, get, api) => ({
  updateThreadText: (threadId, text) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const thread = draft.threads.find((item) => item.id === threadId);
        if (!thread) {
          return;
        }

        const runs: TextRun[] = text ? [{ text }] : [{ text: '' }];
        thread.canonicalText = runs;
        if (thread.ebook.toc.enabled) {
          thread.ebook.toc.label = {
            ko: text.trim() || '제목 없음',
            en: thread.ebook.toc.label?.en || '',
          };
        }
        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      // const currentPlainText = getThreadPlainText(state.document, threadId);
      // Force update by removing the early return so the layout engine can process cleanup properly
      // if (currentPlainText === text) {
      //   return state;
      // }

      const next = Utils.pushHistoryEntry(state, `Update ${threadId}`, nextDocument);
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
      const nextDocument = produce(state.document, (draft) => {
        const thread = draft.threads.find((item) => item.id === threadId);
        if (!thread) {
          return;
        }

        thread.canonicalText = runs;
        const plainText = runs.map((run) => run.text).join('');
        if (thread.ebook.toc.enabled) {
          thread.ebook.toc.label = {
            ko: plainText.trim() || '제목 없음',
            en: thread.ebook.toc.label?.en || '',
          };
        }
        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      const next = Utils.pushHistoryEntry(state, `Update runs ${threadId}`, nextDocument);
      // Force update by removing the early return so the layout engine can process cleanup properly
      // if (nextDocument === state.document) return state;

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
      const nextDocument = produce(state.document, (draft) => {
        const thread = draft.threads.find((item) => item.id === threadId);
        if (!thread) {
          return;
        }

        thread.semanticRole = role;
        thread.styleOverride = Utils.getRoleStyleOverride(role);
        
        if (role === 'heading' || role === 'subheading') {
          thread.ebook = {
            ...thread.ebook,
            toc: { enabled: true },
          };
        } else if (thread.ebook?.toc?.enabled) {
          thread.ebook.toc.enabled = false;
        }

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update thread role ${threadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, threadId]));

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

  updateThreadStyleOverride: (threadId, updates) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const thread = draft.threads.find((item) => item.id === threadId);
        if (!thread) {
          return;
        }

        thread.styleOverride = {
          ...(thread.styleOverride ?? {}),
          ...updates,
        };
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update typography ${threadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, threadId]));

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

  toggleThreadToc: (threadId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const thread = draft.threads.find((item) => item.id === threadId);
        if (!thread) {
          return;
        }

        thread.ebook.toc.enabled = !thread.ebook.toc.enabled;
        if (thread.ebook.toc.enabled) {
          const text = thread.canonicalText.map((run) => run.text).join('').trim() || '제목 없음';
          thread.ebook.toc.tocId = thread.ebook.toc.tocId || `toc_${thread.id}`;
          thread.ebook.toc.level = thread.semanticRole === 'subheading' ? 2 : 1;
          thread.ebook.toc.label = { ko: text, en: thread.ebook.toc.label?.en || '' };
        }

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Toggle toc ${threadId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  deleteThread: (threadId) =>
    set((state) => {
      let selectedBlockBelongsToThread = false;
      const nextDocument = produce(state.document, (draft) => {
        const threadExists = draft.threads.some((item) => item.id === threadId);
        if (!threadExists) {
          return;
        }

        selectedBlockBelongsToThread = state.selection.blockId
          ? state.document.pages.some((page) =>
              page.zones.some((zone) =>
                zone.blocks.some((block) => block.id === state.selection.blockId && block.type === 'text' && block.flow.sourceThreadId === threadId),
              ),
            )
          : false;

        draft.pages.forEach((page) => {
          page.zones.forEach((zone) => {
            zone.blocks = zone.blocks.filter((block) => block.type !== 'text' || block.flow.sourceThreadId !== threadId);
          });
        });

        draft.threads = draft.threads.filter((item) => item.id !== threadId);

        draft.pages = draft.pages
          .filter((page) => {
            if (page.pageRole === 'cover') {
              return true;
            }

            if (page.derivedFrom?.reason !== 'auto-pagination') {
              return true;
            }

            return page.zones.some((zone) => zone.blocks.length > 0);
          })
          .map((page, index) => ({
            ...page,
            pageNumber: index + 1,
          }));

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Delete thread ${threadId}`, nextDocument);

      const fallbackPageId = state.selection.pageId && nextDocument.pages.some((page) => page.id === state.selection.pageId)
        ? state.selection.pageId
        : nextDocument.pages[0]?.id ?? null;
      const fallbackPage = fallbackPageId
        ? nextDocument.pages.find((page) => page.id === fallbackPageId) ?? null
        : null;

      return {
        ...state,
        document: nextDocument,
        selection: selectedBlockBelongsToThread
          ? {
              pageId: fallbackPage?.id ?? null,
              zoneId: fallbackPage?.zones[0]?.zoneId ?? null,
              blockId: null,
            }
          : state.selection,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: state.pagination.invalidatedThreadIds.filter((id) => id !== threadId),
        },
        ...next,
      };
    }),

  addThread: (pageId, zoneId, role = 'paragraph') =>
    set((state) => {
      let existingThreadId: string | null = null;
      let newThreadId = `thread_${Date.now()}`;
      let newBlockId = `${newThreadId}_seg_000`;
      let rootPageId = '';
      let targetZoneId = '';

      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        if (!page) {
          return;
        }
        rootPageId = getChainRootPageId(draft, pageId);
        const rootPage = draft.pages.find((item) => item.id === rootPageId) ?? page;
        const resolvedZoneId = getFlowStartZoneId(draft, rootPage.masterId, zoneId);
        const zone = rootPage.zones.find((item) => item.zoneId === resolvedZoneId) ?? rootPage.zones.find((item) => item.zoneId === zoneId);
        if (!zone) {
          return;
        }
        targetZoneId = zone.zoneId;

        const existingThread = Utils.findExistingThreadForSlot(draft, rootPage.id, zone.zoneId);
        if (existingThread) {
          existingThreadId = existingThread.id;
          newBlockId = existingThread.originBlockId;
          existingThread.canonicalText = [{ text: role === 'heading' ? '새 섹션 제목' : '새 문단을 입력하세요.' }];
          existingThread.styleOverride = Utils.getRoleStyleOverride(role);
          existingThread.semanticRole = role;
          Utils.syncTocFromThreads(draft);
          draft.meta.updatedAt = new Date().toISOString();
          return;
        }

        draft.threads.push({
          id: newThreadId,
          type: 'text-flow',
          canonicalText: [{ text: role === 'heading' ? '새 섹션 제목' : '새 문단을 입력하세요.' }],
          semanticRole: role,
          styleOverride: Utils.getRoleStyleOverride(role),
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

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const targetThreadId = existingThreadId ?? newThreadId;
      const next = Utils.pushHistoryEntry(state, existingThreadId ? `Reset thread ${targetThreadId}` : `Add thread ${targetThreadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, targetThreadId]));

      return {
        ...state,
        document: nextDocument,
        selection: {
          pageId: rootPageId,
          zoneId: targetZoneId,
          blockId: newBlockId,
        },
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
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
      let existingThreadId: string | null = null;
      let newBlockId = `${newThreadId}_seg_000`;
      let rootPageId = '';
      let targetZoneId = '';

      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        if (!page) {
          return;
        }
        rootPageId = getChainRootPageId(draft, pageId);
        const rootPage = draft.pages.find((item) => item.id === rootPageId) ?? page;
        const resolvedZoneId = getFlowStartZoneId(draft, rootPage.masterId, zoneId);
        const zone = rootPage.zones.find((item) => item.zoneId === resolvedZoneId) ?? rootPage.zones.find((item) => item.zoneId === zoneId);
        if (!zone) {
          return;
        }
        targetZoneId = zone.zoneId;

        const existingThread = Utils.findExistingThreadForSlot(draft, rootPage.id, zone.zoneId);
        if (existingThread) {
          existingThreadId = existingThread.id;
          newBlockId = existingThread.originBlockId;
          existingThread.canonicalText = [{ text: trimmedText }];
          existingThread.styleOverride = Utils.getRoleStyleOverride(role);
          existingThread.semanticRole = role;
          Utils.syncTocFromThreads(draft);
          draft.meta.updatedAt = new Date().toISOString();
          return;
        }

        draft.threads.push({
          id: newThreadId,
          type: 'text-flow',
          canonicalText: [{ text: trimmedText }],
          semanticRole: role,
          styleOverride: Utils.getRoleStyleOverride(role),
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

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const targetThreadId = existingThreadId ?? newThreadId;
      // Force state update by creating a new document reference even if canonicalText hasn't changed conceptually
      const next = Utils.pushHistoryEntry(state, existingThreadId ? `Replace thread ${targetThreadId}` : `Add thread ${targetThreadId}`, nextDocument);
      const invalidatedThreadIds = Array.from(new Set([...state.pagination.invalidatedThreadIds, targetThreadId]));

      return {
        ...state,
        document: nextDocument,
        selection: {
          pageId: rootPageId,
          zoneId: targetZoneId,
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

});
