import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PublishingStore } from '../publishingStore';
import * as Utils from './utils';
import {
  findThreadForContributionSlot,
  findZoneForContributionSlot,
  getChainRootPageId,
  getFlowStartZoneId,
  rebuildAllContributionLayouts,
  rebuildContributionLayout,
} from '@/lib/publishing/contributionLayout';
import { DEFAULT_PRESENTATION_TRACKS } from '@/lib/publishing/defaultDocument';
import { parseAuthorTextToRuns } from '@/lib/publishing/structuredLabels';
import { ContributionItem, ContributionSlotContent, TextRun } from '@/types/publishing';

export interface ContributionSlice {
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
}

export const createContributionSlice: StateCreator<PublishingStore, [], [], ContributionSlice> = (set, get, api) => ({
  addImageBlock: (pageId, zoneId, image) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        const zone = page?.zones.find((item) => item.zoneId === zoneId);
        const master = page ? draft.masters.items.find((item) => item.id === page.masterId) : null;
        const zoneTemplate = master?.contentZones.find((item) => item.id === zoneId);
        if (!page || !zone || !zoneTemplate?.frame) {
          return;
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

        draft.assets.push({
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

        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;
      const blockId = `image_${Date.now()}`;

      const next = Utils.pushHistoryEntry(state, `Add image ${blockId}`, nextDocument);
      return {
        ...state,
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
      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        const zone = page?.zones.find((item) => item.zoneId === zoneId);
        const block = zone?.blocks.find((item) => item.id === blockId && item.type === 'image');
        if (!block || block.type !== 'image' || block.locked) {
          return;
        }

        if (updates.placement) {
          block.placement = {
            ...block.placement,
            ...updates.placement,
          };
        }

        if (updates.crop) {
          const width = Utils.clamp(updates.crop.width ?? block.crop.width, 0.2, 1);
          const height = Utils.clamp(updates.crop.height ?? block.crop.height, 0.2, 1);
          block.crop = {
            ...block.crop,
            ...updates.crop,
            width,
            height,
            originX: Utils.clamp(updates.crop.originX ?? block.crop.originX, 0, 1 - width),
            originY: Utils.clamp(updates.crop.originY ?? block.crop.originY, 0, 1 - height),
          };
        }

        draft.meta.updatedAt = new Date().toISOString();
      });
      if (nextDocument === state.document) return state;
      const next = Utils.pushHistoryEntry(state, `Update image ${blockId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  toggleBlockLock: (pageId, zoneId, blockId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        const zone = page?.zones.find((item) => item.zoneId === zoneId);
        const block = zone?.blocks.find((item) => item.id === blockId);
        if (!block) {
          return;
        }

        block.locked = !block.locked;
        draft.meta.updatedAt = new Date().toISOString();
      });
      
      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Toggle lock ${blockId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  addContribution: (pageId, contribution, masterId) => {
    let createdContributionId: string | null = null;

    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const page = draft.pages.find((item) => item.id === pageId) ?? draft.pages[0];
        const fallbackMasterId = draft.masters.items.find((item) => item.mode === 'speaker-thread')?.id
          ?? page?.masterId
          ?? draft.masters.defaultMasterId;
        const resolvedMasterId = masterId ?? fallbackMasterId;
        if (!resolvedMasterId) {
          return;
        }

        const master = draft.masters.items.find((item) => item.id === resolvedMasterId);
        if (!master) {
          return;
        }
        draft.contributions = draft.contributions ?? [];

        const rootPageId = getChainRootPageId(draft, page.id);
        const reusablePage = Utils.canReuseContributionPage(draft, rootPageId)
          ? draft.pages.find((item) => item.id === rootPageId) ?? null
          : null;
        const newPage = reusablePage ?? Utils.createPageFromMaster(draft, resolvedMasterId, draft.pages.length + 1);
        if (!newPage) {
          return;
        }
        if (!reusablePage) {
          draft.pages.push(newPage);
        } else {
          newPage.masterId = resolvedMasterId;
          newPage.pageRole = 'body';
          newPage.derivedFrom = undefined;
          newPage.zones = master.contentZones.map((zone) => ({
            zoneId: zone.id,
            blocks: [],
          }));
        }

        const contributionId = Utils.createId('contribution');
        createdContributionId = contributionId;

        const normalizedSlots = Utils.buildContributionSlotsForMaster(master, contribution.slots);
        const contributionTitle =
          normalizedSlots.find((slot) => slot.slotKey === 'title_ko')?.text
          || normalizedSlots.find((slot) => slot.slotKey === 'title_en')?.text
          || contribution.title.trim()
          || `새 발표자 ${draft.contributions.length + 1}`;
        const contributionTrack = normalizedSlots.find((slot) => slot.slotKey === 'track')?.text || contribution.track;
        const presentationTrackId = Utils.inferPresentationTrackId(
          draft.meta.presentationTracks?.length ? draft.meta.presentationTracks : DEFAULT_PRESENTATION_TRACKS,
          contributionTrack,
          contributionTitle,
        );

        const contributionRecord: ContributionItem = {
          id: contributionId,
          order: draft.contributions.length + 1,
          masterId: resolvedMasterId,
          pageId: newPage.id,
          status: 'draft',
          title: contributionTitle,
          track: contributionTrack,
          presentationTrackId,
          sourceFileName: contribution.sourceFileName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          slots: normalizedSlots,
        };

        draft.contributions.push(contributionRecord);
        Utils.renumberContributionPresentationCodes(draft);

        for (const slot of normalizedSlots.filter((item) => item.text.trim())) {
          const zone = findZoneForContributionSlot(draft, resolvedMasterId, slot.slotKey);
          if (!zone) {
            continue;
          }

          const threadId = Utils.createId('thread');
          const blockId = `${threadId}_seg_000`;
          draft.threads.push({
            id: threadId,
            type: 'text-flow',
            canonicalText: (slot.slotKey === 'authors_ko' || slot.slotKey === 'authors_en') ? parseAuthorTextToRuns(slot.text) : [{ text: slot.text }],
            semanticRole: slot.role,
            styleOverride: Utils.getRoleStyleOverride(slot.role),
            ebook: {
              include: true,
              toc: {
                enabled: slot.role === 'heading' || slot.role === 'subheading',
              },
            },
            originBlockId: blockId,
            sourceZoneId: getFlowStartZoneId(draft, resolvedMasterId, zone.id),
            sourcePageId: newPage.id,
            zoneSequence: [{ pageId: newPage.id, zoneId: getFlowStartZoneId(draft, resolvedMasterId, zone.id) }],
          });
        }

        const addedContribution = draft.contributions.find((c) => c.id === contributionId);
        if (addedContribution) {
          rebuildContributionLayout(draft, addedContribution, Utils.createPageFromMaster);
        }

        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Add contribution ${createdContributionId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...nextDocument.threads
            .filter((t) =>
              t.sourcePageId === nextDocument.contributions.find((c) => c.id === createdContributionId)?.pageId
            )
            .map((t) => t.id)
        ]),
      );

      const pageIdToSelect = nextDocument.contributions.find((c) => c.id === createdContributionId)?.pageId;
      const zoneIdToSelect = pageIdToSelect ? nextDocument.pages.find(p => p.id === pageIdToSelect)?.zones[0]?.zoneId : null;

      return {
        ...state,
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds,
        },
        selection: {
          pageId: pageIdToSelect ?? null,
          zoneId: zoneIdToSelect ?? null,
          blockId: null,
        },
        ...next,
      };
    });

    return createdContributionId;
  },

  createSpeakerContribution: (pageId, masterId): string | null => {
    const state = get();
    const page = state.document.pages.find((item) => item.id === pageId) ?? state.document.pages[0];
    const resolvedMasterId = masterId
      ?? state.document.masters.items.find((item) => item.mode === 'speaker-thread')?.id
      ?? page?.masterId;
    const master = state.document.masters.items.find((item) => item.id === resolvedMasterId);
    if (!page || !resolvedMasterId || !master) {
      return null;
    }

    const draftSlots = master.slotSchema?.map((slot) => ({
      slotKey: slot.slotKey,
      label: slot.label,
      role: slot.role,
      text: '',
      language: slot.language,
    })) ?? [];

    return get().addContribution(pageId, {
      track: '',
      title: '',
      slots: draftSlots,
    }, resolvedMasterId);
  },

  updateContributionSlotText: (contributionId, slotKey, text) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const contribution = (draft.contributions ?? []).find((item) => item.id === contributionId);
        if (!contribution) {
          return;
        }

        const normalizedText = Utils.normalizeContributionSlotText(slotKey, text);
        const slot = contribution.slots.find((item) => item.slotKey === slotKey);
        const master = draft.masters.items.find((item) => item.id === contribution.masterId);
        if (!slot && !master) {
          return;
        }

        const resolvedSlot = slot ?? (() => {
          const definition = master?.slotSchema?.find((item) => item.slotKey === slotKey);
          if (!definition) {
            return null;
          }
          const createdSlot: ContributionSlotContent = {
            slotKey: definition.slotKey,
            label: definition.label,
            role: definition.role,
            language: definition.language,
            text: '',
          };
          contribution.slots.push(createdSlot);
          return createdSlot;
        })();
        if (!resolvedSlot) {
          return;
        }

        resolvedSlot.text = normalizedText;
        contribution.title =
          contribution.slots.find((item) => item.slotKey === 'title_ko')?.text
          || contribution.slots.find((item) => item.slotKey === 'title_en')?.text
          || contribution.title;
        contribution.track = contribution.slots.find((item) => item.slotKey === 'track')?.text || contribution.track;
        contribution.presentationTrackId =
          contribution.presentationTrackId
          ?? Utils.inferPresentationTrackId(
            draft.meta.presentationTracks?.length ? draft.meta.presentationTracks : DEFAULT_PRESENTATION_TRACKS,
            contribution.track,
            contribution.title,
          );
        contribution.status = 'draft';
        contribution.updatedAt = new Date().toISOString();

        const thread = findThreadForContributionSlot(draft, contribution, slotKey);
        if (thread && normalizedText) {
          const isSame = thread.canonicalText.map(r => r.text).join('') === normalizedText;
          if (isSame) {
            // Text is exactly the same, but we still need to force rebuild layout to ensure cleanup of duplicated/overflow pages
            thread.canonicalText = [...thread.canonicalText];
          } else {
            thread.canonicalText = (slotKey === 'authors_ko' || slotKey === 'authors_en') ? parseAuthorTextToRuns(normalizedText) : [{ text: normalizedText }];
          }
          thread.semanticRole = resolvedSlot.role;
          thread.styleOverride = Utils.getRoleStyleOverride(resolvedSlot.role);
        } else if (thread && !normalizedText) {
          draft.threads = draft.threads.filter((item) => item.id !== thread.id);
        } else if (!thread && normalizedText) {
          const zone = findZoneForContributionSlot(draft, contribution.masterId, slotKey);
          if (zone) {
            const threadId = Utils.createId('thread');
            const blockId = `${threadId}_seg_000`;
            draft.threads.push({
              id: threadId,
              type: 'text-flow',
              canonicalText: (slotKey === 'authors_ko' || slotKey === 'authors_en') ? parseAuthorTextToRuns(normalizedText) : [{ text: normalizedText }],
              semanticRole: resolvedSlot.role,
              styleOverride: Utils.getRoleStyleOverride(resolvedSlot.role),
              ebook: {
                include: true,
                toc: {
                  enabled: resolvedSlot.role === 'heading' || resolvedSlot.role === 'subheading',
                },
              },
              originBlockId: blockId,
              sourceZoneId: getFlowStartZoneId(draft, contribution.masterId, zone.id),
              sourcePageId: contribution.pageId,
              zoneSequence: [{ pageId: contribution.pageId, zoneId: getFlowStartZoneId(draft, contribution.masterId, zone.id) }],
            });
          }
        }

        rebuildContributionLayout(draft, contribution, Utils.createPageFromMaster);
        Utils.renumberContributionPresentationCodes(draft);
        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;
      const thread = findThreadForContributionSlot(state.document, state.document.contributions.find(c => c.id === contributionId)!, slotKey);

      // Force state update by creating a new document reference even if canonicalText hasn't changed conceptually
      const next = Utils.pushHistoryEntry(state, `Update contribution slot ${slotKey}`, nextDocument);

      return {
        ...state,
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: thread
            ? Array.from(new Set([...state.pagination.invalidatedThreadIds, thread.id]))
            : state.pagination.invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateContributionSlotRuns: (contributionId, slotKey, runs) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const contribution = (draft.contributions ?? []).find((item) => item.id === contributionId);
        if (!contribution) {
          return;
        }

        const mergedRuns = Utils.mergeRuns(runs);
        const plainText = mergedRuns.map((run) => run.text).join('');
        const normalizedText = Utils.normalizeContributionSlotText(slotKey, plainText);
        const slot = contribution.slots.find((item) => item.slotKey === slotKey);
        const master = draft.masters.items.find((item) => item.id === contribution.masterId);
        if (!slot && !master) {
          return;
        }

        const resolvedSlot = slot ?? (() => {
          const definition = master?.slotSchema?.find((item) => item.slotKey === slotKey);
          if (!definition) {
            return null;
          }
          const createdSlot: ContributionSlotContent = {
            slotKey: definition.slotKey,
            label: definition.label,
            role: definition.role,
            language: definition.language,
            text: '',
          };
          contribution.slots.push(createdSlot);
          return createdSlot;
        })();
        if (!resolvedSlot) {
          return;
        }

        resolvedSlot.text = normalizedText;
        contribution.title =
          contribution.slots.find((item) => item.slotKey === 'title_ko')?.text
          || contribution.slots.find((item) => item.slotKey === 'title_en')?.text
          || contribution.title;
        contribution.track = contribution.slots.find((item) => item.slotKey === 'track')?.text || contribution.track;
        contribution.presentationTrackId =
          contribution.presentationTrackId
          ?? Utils.inferPresentationTrackId(
            draft.meta.presentationTracks?.length ? draft.meta.presentationTracks : DEFAULT_PRESENTATION_TRACKS,
            contribution.track,
            contribution.title,
          );
        contribution.status = 'draft';
        contribution.updatedAt = new Date().toISOString();

        const sanitizedRuns = mergedRuns.map((run) => ({
          text: run.text,
          marks: run.marks && Object.values(run.marks).some(Boolean) ? run.marks : undefined,
        }));
        const thread = findThreadForContributionSlot(draft, contribution, slotKey);
        if (thread && normalizedText) {
          const isSame = JSON.stringify(thread.canonicalText) === JSON.stringify(sanitizedRuns);
          if (isSame) {
            // Force reference change to trigger react renders & pagination updates
            thread.canonicalText = [...thread.canonicalText];
          } else {
            thread.canonicalText = sanitizedRuns;
          }
          thread.semanticRole = resolvedSlot.role;
          thread.styleOverride = Utils.getRoleStyleOverride(resolvedSlot.role);
        } else if (thread && !normalizedText) {
          draft.threads = draft.threads.filter((item) => item.id !== thread.id);
        } else if (!thread && normalizedText) {
          const zone = findZoneForContributionSlot(draft, contribution.masterId, slotKey);
          if (zone) {
            const threadId = Utils.createId('thread');
            const blockId = `${threadId}_seg_000`;
            draft.threads.push({
              id: threadId,
              type: 'text-flow',
              canonicalText: sanitizedRuns,
              semanticRole: resolvedSlot.role,
              styleOverride: Utils.getRoleStyleOverride(resolvedSlot.role),
              ebook: {
                include: true,
                toc: {
                  enabled: resolvedSlot.role === 'heading' || resolvedSlot.role === 'subheading',
                },
              },
              originBlockId: blockId,
              sourceZoneId: getFlowStartZoneId(draft, contribution.masterId, zone.id),
              sourcePageId: contribution.pageId,
              zoneSequence: [{ pageId: contribution.pageId, zoneId: getFlowStartZoneId(draft, contribution.masterId, zone.id) }],
            });
          }
        }

        rebuildContributionLayout(draft, contribution, Utils.createPageFromMaster);
        Utils.renumberContributionPresentationCodes(draft);
        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;
      const thread = findThreadForContributionSlot(state.document, state.document.contributions.find(c => c.id === contributionId)!, slotKey);

      // Force state update by creating a new document reference even if canonicalText hasn't changed conceptually
      const next = Utils.pushHistoryEntry(state, `Update contribution runs ${slotKey}`, nextDocument);

      return {
        ...state,
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: thread
            ? Array.from(new Set([...state.pagination.invalidatedThreadIds, thread.id]))
            : state.pagination.invalidatedThreadIds,
        },
        ...next,
      };
    }),

  updateContributionPresentationTrack: (contributionId, trackId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const contribution = (draft.contributions ?? []).find((item) => item.id === contributionId);
        if (!contribution) {
          return;
        }

        contribution.presentationTrackId = trackId || undefined;
        contribution.status = 'draft';
        contribution.updatedAt = new Date().toISOString();
        Utils.renumberContributionPresentationCodes(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update contribution presentation track ${contributionId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updateContributionStatus: (contributionId, status) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const contribution = (draft.contributions ?? []).find((item) => item.id === contributionId);
        if (!contribution) {
          return;
        }

        contribution.status = status;
        contribution.updatedAt = new Date().toISOString();
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update contribution status ${contributionId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  moveContribution: (contributionId, direction) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const currentIndex = (draft.contributions ?? []).findIndex((item) => item.id === contributionId);
        if (currentIndex < 0) {
          return;
        }

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= draft.contributions.length) {
          return;
        }

        const [moved] = draft.contributions.splice(currentIndex, 1);
        draft.contributions.splice(targetIndex, 0, moved);
        Utils.renumberContributionPresentationCodes(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const moved = nextDocument.contributions.find((c) => c.id === contributionId);
      const next = Utils.pushHistoryEntry(state, `Move contribution ${contributionId} ${direction}`, nextDocument);

      return {
        ...state,
        document: nextDocument,
        selection: moved ? {
          pageId: moved.pageId,
          zoneId: nextDocument.pages.find((page) => page.id === moved.pageId)?.zones[0]?.zoneId ?? null,
          blockId: null,
        } : state.selection,
        ...next,
      };
    }),

  rebuildAllContributionsLayout: () =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        rebuildAllContributionLayouts(draft, Utils.createPageFromMaster);
        draft.meta.updatedAt = new Date().toISOString();
        Utils.syncTocFromThreads(draft);
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, 'Rebuild all contributions layout', nextDocument);
      return {
        ...state,
        document: nextDocument,
        pagination: {
          ...state.pagination,
          invalidatedThreadIds: Array.from(new Set([...state.pagination.invalidatedThreadIds, ...nextDocument.threads.map((thread) => thread.id)])),
        },
        ...next,
      };
    }),

  deleteContribution: (contributionId) =>
    set((state) => {
      let fallbackPageId: string | null = null;
      const nextDocument = produce(state.document, (draft) => {
        const contribution = (draft.contributions ?? []).find((item) => item.id === contributionId);
        if (!contribution) {
          return;
        }

        const chainPageIds = new Set(
          draft.pages
            .filter((page) => getChainRootPageId(draft, page.id) === contribution.pageId)
            .map((page) => page.id),
        );
        const fallbackPage =
          draft.pages
            .filter((page) => !chainPageIds.has(page.id))
            .find((page) => page.pageNumber > (draft.pages.find((page) => page.id === contribution.pageId)?.pageNumber ?? 0))
          ?? draft.pages.find((page) => !chainPageIds.has(page.id))
          ?? null;
        
        fallbackPageId = fallbackPage?.id ?? null;

        draft.contributions = draft.contributions.filter((item) => item.id !== contributionId);
        draft.threads = draft.threads.filter((thread) => {
          if (getChainRootPageId(draft, thread.sourcePageId) === contribution.pageId) {
            return false;
          }

          if (thread.zoneSequence.some((item) => chainPageIds.has(item.pageId))) {
            return false;
          }

          return true;
        });
        draft.pages = draft.pages.filter((page) => !chainPageIds.has(page.id));
        draft.pages = draft.pages.map((page, index) => ({
          ...page,
          pageNumber: index + 1,
        }));
        Utils.renumberContributionPresentationCodes(draft);
        Utils.syncTocFromThreads(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Delete contribution ${contributionId}`, nextDocument);
      const actualFallbackPage = fallbackPageId ? nextDocument.pages.find(p => p.id === fallbackPageId) : null;

      return {
        ...state,
        document: nextDocument,
        selection: {
          pageId: actualFallbackPage?.id ?? null,
          zoneId: actualFallbackPage?.zones[0]?.zoneId ?? null,
          blockId: null,
        },
        ...next,
      };
    }),
});
