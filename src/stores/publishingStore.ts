import { create } from 'zustand';
import { produce } from 'immer';
import { TemplatePresetKey } from '@/lib/publishing/templatePresets';
import { rehydrateContributionThreadText } from '@/lib/publishing/threadTextSerialization';
import {
  ContributionItem,
  ContributionSlotContent,
  HistoryEntry,
  PresentationTrackOption,
  PublishingDocument,
  PublishingEditorState,
  TextRole,
  TextRun,
  TypographyStyle,
} from '@/types/publishing';

import { createHistorySlice } from './publishing/historySlice';
import { createPageSlice } from './publishing/pageSlice';
import { createThreadSlice } from './publishing/threadSlice';
import { createContributionSlice } from './publishing/contributionSlice';
import { createMasterSlice } from './publishing/masterSlice';

import * as Utils from './publishing/utils';

export interface PublishingStore extends PublishingEditorState {
  isThreadsLoaded: boolean;
  initialize: (document?: PublishingDocument) => void;
  loadThreads: (threads: PublishingDocument['threads']) => void;
  selectPage: (pageId: string) => void;
  selectBlock: (pageId: string, zoneId: string, blockId: string) => void;
  addPage: (masterId?: string) => void;
  deletePage: (pageId: string) => void;
  createMaster: (name?: string, preset?: TemplatePresetKey) => void;
  duplicateMaster: (masterId: string) => void;
  deleteMaster: (masterId: string) => void;
  setDefaultMaster: (masterId: string) => void;
  renameMaster: (masterId: string, name: string) => void;
  setMasterPresentationTracksUsage: (masterId: string, enabled: boolean) => void;
  resetSpeakerThreadMaster: (masterId: string) => void;
  updatePageMaster: (pageId: string, masterId: string) => void;
  applyTemplatePreset: (masterId: string, preset: TemplatePresetKey) => void;
  updateDocumentMeta: (titleKo: string, titleEn?: string) => void;
  addPresentationTrack: (kind?: PresentationTrackOption['kind']) => void;
  updatePresentationTrack: (trackId: string, updates: Partial<PresentationTrackOption>) => void;
  deletePresentationTrack: (trackId: string) => void;
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
      shape: 'rect' | 'line' | 'ellipse';
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
      shape: 'rect' | 'line' | 'ellipse';
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
  importGlobalMasters: (masters: PublishingDocument['masters']['items']) => void;
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
  addContribution: (
    pageId: string,
    contribution: {
      sourceFileName?: string;
      track: string;
      title: string;
      slots: ContributionSlotContent[];
    },
    masterId?: string,
  ) => string | null;
  createSpeakerContribution: (pageId: string, masterId?: string) => string | null;
  updateContributionSlotText: (contributionId: string, slotKey: string, text: string) => void;
  updateContributionSlotRuns: (contributionId: string, slotKey: string, runs: TextRun[]) => void;
  updateContributionPresentationTrack: (contributionId: string, trackId: string) => void;
  updateContributionStatus: (contributionId: string, status: 'draft' | 'completed') => void;
  moveContribution: (contributionId: string, direction: 'up' | 'down') => void;
  rebuildAllContributionsLayout: () => void;
  deleteContribution: (contributionId: string) => void;
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
  markSaving: () => void;
  markSaved: () => void;
  markSaveFailed: (message: string) => void;
  undo: () => void;
  redo: () => void;
}

export const usePublishingStore = create<PublishingStore>()((set, get, api) => ({
  ...Utils.createStoreState(),

  initialize: (document) =>
    set(() => {
      const state = Utils.createStoreState(document ? Utils.sanitizePublishingDocument(document) : document);
      return {
        ...state,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: state.document.threads.map((thread) => thread.id),
        },
      };
    }),

  loadThreads: (threads) =>
    set((state) => {
      const rehydrated = rehydrateContributionThreadText(state.document, threads);
      const nextDocument = produce(state.document, (draft) => {
        draft.threads = rehydrated;
        if (draft.threads.length > 0) {
          Utils.syncTocFromThreads(draft);
        }
      });
      return {
        ...state,
        document: nextDocument,
        isThreadsLoaded: true,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: Array.from(new Set([
            ...state.pagination.invalidatedThreadIds,
            ...rehydrated.map((thread) => thread.id)
          ])),
        },
      };
    }),

  ...createPageSlice(set, get, api),

  ...createMasterSlice(set, get, api),

  ...createThreadSlice(set, get, api),
  ...createContributionSlice(set, get, api),
  ...createHistorySlice(set, get, api),

}));

let autosaveTimer: number | null = null;

usePublishingStore.subscribe((state) => {
  if (!state.autosave.dirty) {
    return;
  }

  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
  }

  autosaveTimer = window.setTimeout(() => {
    const current = usePublishingStore.getState();

    // Prevent saving if threads are not fully loaded yet to avoid race conditions
    if (!current.isThreadsLoaded) {
      return;
    }

    window.localStorage.setItem(
      `publishing-draft:${current.document.id}`,
      JSON.stringify(current.document),
    );
  }, Utils.AUTOSAVE_DEBOUNCE_MS);
});
