import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PublishingStore } from '../publishingStore';
import * as Utils from './utils';

import {
  findThreadForContributionSlot,
  findZoneForContributionSlot,
  getChainRootPageId,
  getFlowStartZoneId,
  inferZoneSlotKey,
  normalizeContributionOrder,
  rebuildAllContributionLayouts,
  rebuildContributionLayout,
  sortFlowZonesForReadingOrder,
} from '@/lib/publishing/contributionLayout';
import { DEFAULT_PRESENTATION_TRACKS, createImageZone, createInitialPublishingDocument, createMainBodyZone, createSpeakerThreadZones } from '@/lib/publishing/defaultDocument';
import { normalizeStructuredBodyText, parseAuthorTextToRuns } from '@/lib/publishing/structuredLabels';
import { applyPresetToMaster, TemplatePresetKey } from '@/lib/publishing/templatePresets';
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

export interface MasterSlice {
  createMaster: (name?: string, preset?: TemplatePresetKey) => void;
  renameMaster: (masterId: string, name: string) => void;
  setMasterPresentationTracksUsage: (masterId: string, enabled: boolean) => void;
  resetSpeakerThreadMaster: (masterId: string) => void;
  duplicateMaster: (masterId: string) => void;
  importGlobalMasters: (masters: PublishingDocument['masters']['items']) => void;
  deleteMaster: (masterId: string) => void;
  setDefaultMaster: (masterId: string) => void;
  applyTemplatePreset: (masterId: string, preset: TemplatePresetKey) => void;
  updateMasterBackground: (masterId: string, fill: string) => void;
  toggleMasterLock: (masterId: string) => void;
  updateMasterDecoration: (masterId: string, decorationId: string, updates: Partial<{ x: number; y: number; width: number; height: number; text: string; fill: string; shape: 'rect' | 'line' | 'ellipse'; style: Partial<TypographyStyle>; }>) => void;
  updateGlobalMasterDecoration: (masterId: string, decorationId: string, updates: Partial<{ x: number; y: number; width: number; height: number; text: string; fill: string; shape: 'rect' | 'line' | 'ellipse'; style: Partial<TypographyStyle>; }>) => void;
  updateMasterZoneFrame: (masterId: string, zoneId: string, updates: Partial<{ x: number; y: number; width: number; height: number; }>) => void;
  updateMasterZoneStyle: (masterId: string, zoneId: string, updates: Partial<TypographyStyle>) => void;
  updateMasterZoneMeta: (masterId: string, zoneId: string, updates: Partial<{ name: string; slotKey?: string; flowGroupId?: string; flowOrder?: number; allowThreadContinuation?: boolean; }>) => void;
  addMasterTextDecoration: (masterId: string) => void;
  addMasterShapeDecoration: (masterId: string) => void;
  addMasterImageDecoration: (masterId: string, image: { src: string; naturalWidth: number; naturalHeight: number; storagePath?: string; }) => void;
  removeMasterDecoration: (masterId: string, decorationId: string) => void;
  toggleMasterDecorationLock: (masterId: string, decorationId: string) => void;
  toggleMasterZoneLock: (masterId: string, zoneId: string) => void;
  addMasterTextZone: (masterId: string) => void;
  addMasterImageZone: (masterId: string) => void;
  removeMasterZone: (masterId: string, zoneId: string) => void;
}

export const createMasterSlice: StateCreator<PublishingStore, [], [], MasterSlice> = (set, get, api) => ({
  createMaster: (name, preset = 'single-column') =>
    set((state) => {
      let newMasterId = Utils.createId('master');
      const nextDocument = produce(state.document, (draft) => {
        const bodyLikeMaster = draft.masters.items.find((item) => item.id === draft.masters.defaultMasterId)
          ?? draft.masters.items.find((item) => item.id === 'master_body')
          ?? draft.masters.items[0];

        const newMaster = bodyLikeMaster
          ? {
              ...Utils.clone(bodyLikeMaster),
              id: newMasterId,
              name: name || `New Master ${draft.masters.items.length + 1}`,
              locked: false,
              decorations: Utils.clone(bodyLikeMaster.decorations).map((decoration) => ({
                ...decoration,
                id: Utils.createId('decoration'),
              })),
              contentZones: Utils.clone(bodyLikeMaster.contentZones).map((zone) => Utils.renameZoneForMaster(zone)),
            }
          : {
              id: newMasterId,
              name: name || `New Master ${draft.masters.items.length + 1}`,
              scope: 'global' as const,
              locked: false,
              background: { fill: '#ffffff', image: null },
              decorations: [],
              contentZones: [{ ...createMainBodyZone(), id: Utils.createId('zone') }],
            };

        applyPresetToMaster(newMaster, preset);
        newMaster.contentZones = newMaster.contentZones.map((zone) => Utils.renameZoneForMaster(zone));
        newMaster.decorations = newMaster.decorations.map((decoration) => Utils.renameDecorationForMaster(decoration));

        draft.masters.items.push(newMaster);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Create master ${newMasterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  renameMaster: (masterId, name) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || !name.trim()) {
          return;
        }

        master.name = name.trim();
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Rename master ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  setMasterPresentationTracksUsage: (masterId, enabled) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || master.mode !== 'speaker-thread') {
          return;
        }

        master.usesPresentationTracks = enabled;
        Utils.renumberContributionPresentationCodes(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Set master presentation tracks ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  resetSpeakerThreadMaster: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || master.mode !== 'speaker-thread') {
          return;
        }

        master.contentZones = createSpeakerThreadZones();
        Utils.normalizeMasterFlowGroups(master);

        draft.pages.forEach((page) => {
          if (page.masterId !== masterId) {
            return;
          }

          page.zones = master.contentZones.map((zone) => ({
            zoneId: zone.id,
            blocks: [],
          }));
        });

        (draft.contributions ?? [])
          .filter((contribution) => contribution.masterId === masterId)
          .forEach((contribution) => {
            rebuildContributionLayout(draft, contribution, Utils.createPageFromMaster);
          });

        draft.meta.updatedAt = new Date().toISOString();
        Utils.syncTocFromThreads(draft);
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Reset speaker thread master ${masterId}`, nextDocument);
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

  duplicateMaster: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        const duplicatedMaster = Utils.clone(master);
        duplicatedMaster.id = Utils.createId('master');
        duplicatedMaster.name = `${master.name} Copy`;
        duplicatedMaster.locked = false;
        duplicatedMaster.decorations = duplicatedMaster.decorations.map((decoration) => ({
          ...decoration,
          id: Utils.createId('decoration'),
        }));
        duplicatedMaster.contentZones = duplicatedMaster.contentZones.map((zone) => Utils.renameZoneForMaster(zone));

        draft.masters.items.push(duplicatedMaster);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Duplicate master ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  importGlobalMasters: (newMasters) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        let importedCount = 0;

        newMasters.forEach((master) => {
          const existingIndex = draft.masters.items.findIndex((m) => m.id === master.id);
          if (existingIndex === -1) {
            draft.masters.items.push(Utils.clone(master));
            importedCount += 1;
          } else {
            draft.masters.items[existingIndex] = Utils.clone(master);
            importedCount += 1;
          }
        });

        if (importedCount > 0) {
          draft.meta.updatedAt = new Date().toISOString();

          // 마스터 템플릿을 덮어쓸 때, 기존 스레드(본문 데이터)에 잘못 저장된 볼드 오버라이드도 함께 정리합니다.
          draft.threads.forEach((thread) => {
            if (thread.semanticRole === 'paragraph' && (thread.sourceZoneId.includes('body') || thread.id.includes('body'))) {
              // 1. 스레드 자체의 폰트 두께 강제 오버라이드 제거
              if (thread.styleOverride) {
                thread.styleOverride.fontWeight = undefined;
                thread.styleOverride.fontFamily = undefined;
              }
              // 2. 텍스트 내부(TextRun)에 부분적으로 적용된 볼드 마크(강제 굵은글씨) 일괄 해제
              if (Array.isArray(thread.canonicalText)) {
                thread.canonicalText.forEach((run) => {
                  if (run.marks) {
                    run.marks.bold = undefined;
                  }
                });
              }
            }
          });
        }
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, 'Import global masters', nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  deleteMaster: (masterId) =>
    set((state) => {
      let affectedPageIds: string[] = [];
      const nextDocument = produce(state.document, (draft) => {
        if (draft.masters.items.length <= 1) {
          return;
        }

        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        const fallbackMaster = draft.masters.items.find((item) => item.id !== masterId);
        if (!fallbackMaster) {
          return;
        }

        affectedPageIds = draft.pages.filter((page) => page.masterId === masterId).map((page) => page.id);
        draft.masters.items = draft.masters.items.filter((item) => item.id !== masterId);
        if (draft.masters.defaultMasterId === masterId) {
          draft.masters.defaultMasterId = fallbackMaster.id;
        }

        const fallbackZoneId = Utils.getPrimaryFlowZoneId(draft, fallbackMaster.id);
        draft.pages.forEach((page) => {
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
          draft.threads.forEach((thread) => {
            const affected = thread.zoneSequence.some((item) =>
              draft.pages.some((page) => page.id === item.pageId && page.masterId === fallbackMaster.id),
            ) || draft.pages.some((page) => page.id === thread.sourcePageId && page.masterId === fallbackMaster.id);
            if (affected) {
              thread.sourceZoneId = fallbackZoneId;
            }
          });
        }

        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Delete master ${masterId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...nextDocument.threads
            .filter((thread) => affectedPageIds.includes(thread.sourcePageId) || thread.zoneSequence.some((item) => affectedPageIds.includes(item.pageId)))
            .map((thread) => thread.id),
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

  setDefaultMaster: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        if (!draft.masters.items.some((item) => item.id === masterId)) {
          return;
        }

        draft.masters.defaultMasterId = masterId;
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Set default master ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  applyTemplatePreset: (masterId, preset) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        applyPresetToMaster(master, preset);
        master.decorations = master.decorations.map((decoration) => Utils.renameDecorationForMaster(decoration));
        draft.pages.forEach((page) => {
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

        draft.threads.forEach((thread) => {
          const usesMaster = draft.pages.some((page) => page.masterId === masterId && thread.zoneSequence.some((item) => item.pageId === page.id));
          if (usesMaster && primaryFlowZone) {
            thread.sourceZoneId = primaryFlowZone.id;
          }
        });
        
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Apply template preset ${preset}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set([
          ...state.pagination.invalidatedThreadIds,
          ...nextDocument.threads
            .filter((thread) =>
              nextDocument.pages.some((page) => page.masterId === masterId && thread.zoneSequence.some((item) => item.pageId === page.id)),
            )
            .map((thread) => thread.id),
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

  updateDocumentMeta: (titleKo, titleEn = '') =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        draft.meta.title = { ko: titleKo, en: titleEn };
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, 'Update document title', nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  addPresentationTrack: (kind = 'oral') =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const tracks = draft.meta.presentationTracks?.length
          ? [...draft.meta.presentationTracks]
          : [...DEFAULT_PRESENTATION_TRACKS];
        const sameKindCount = tracks.filter((item) => item.kind === kind).length + 1;
        tracks.push({
          id: Utils.createId(`presentation-track-${kind}`),
          kind,
          prefix: `${kind === 'oral' ? 'O' : 'P'}${sameKindCount}`,
          label: '새 트랙',
          glmHints: [],
        });
        draft.meta.presentationTracks = tracks;
        Utils.renumberContributionPresentationCodes(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, 'Add presentation track', nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updatePresentationTrack: (trackId, updates) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const tracks = draft.meta.presentationTracks?.length
          ? [...draft.meta.presentationTracks]
          : [...DEFAULT_PRESENTATION_TRACKS];
        const track = tracks.find((item) => item.id === trackId);
        if (!track) {
          return;
        }
        Object.assign(track, updates);
        draft.meta.presentationTracks = tracks.map((item) => ({
          ...item,
          prefix: item.prefix.trim(),
          label: item.label.trim(),
          glmHints: (item.glmHints ?? []).map((hint) => hint.trim()).filter(Boolean),
        }));
        Utils.renumberContributionPresentationCodes(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update presentation track ${trackId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  deletePresentationTrack: (trackId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const tracks = draft.meta.presentationTracks?.length
          ? [...draft.meta.presentationTracks]
          : [...DEFAULT_PRESENTATION_TRACKS];
        if (!tracks.some((item) => item.id === trackId)) {
          return;
        }
        draft.meta.presentationTracks = tracks.filter((item) => item.id !== trackId);
        draft.contributions.forEach((contribution) => {
          if (contribution.presentationTrackId === trackId) {
            contribution.presentationTrackId = undefined;
            contribution.presentationCode = undefined;
            contribution.status = 'draft';
            contribution.updatedAt = new Date().toISOString();
          }
        });
        Utils.renumberContributionPresentationCodes(draft);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Delete presentation track ${trackId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updatePageNumbering: (updates) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        draft.layout.pageNumbering = {
          ...draft.layout.pageNumbering,
          ...updates,
        };
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, 'Update page numbering', nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updatePrintGuides: (updates) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        draft.layout.printGuides = {
          ...draft.layout.printGuides,
          ...updates,
        };
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, 'Update print guides', nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updateMasterBackground: (masterId, fill) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || master.locked) {
          return;
        }

        master.background.fill = fill;
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update master background ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  toggleMasterLock: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        master.locked = !master.locked;
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Toggle master lock ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updateMasterDecoration: (masterId, decorationId, updates) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const decoration = master?.decorations.find((item) => item.id === decorationId);
        if (!master || !decoration || decoration.scope === 'global-fixed' || decoration.locked) {
          return;
        }

        const { style, ...restUpdates } = updates;
        Object.assign(decoration, restUpdates);
        if (style) {
          decoration.style = {
            ...(decoration.style ?? {}),
            ...style,
          };
        }
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update decoration ${decorationId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updateGlobalMasterDecoration: (masterId, decorationId, updates) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const decoration = master?.decorations.find((item) => item.id === decorationId);
        if (!master || !decoration || decoration.scope !== 'global-fixed') {
          return;
        }

        const { style, ...restUpdates } = updates;
        Object.assign(decoration, restUpdates);
        if (style) {
          decoration.style = {
            ...(decoration.style ?? {}),
            ...style,
          };
        }

        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Admin update global decoration ${decorationId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  updateMasterZoneFrame: (masterId, zoneId, updates) =>
    set((state) => {
      let zoneFlowGroupId: string | undefined;
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const zone = master?.contentZones.find((item) => item.id === zoneId);
        if (!master || !zone || zone.scope === 'global-fixed' || zone.locked) {
          return;
        }

        zoneFlowGroupId = zone.flowGroupId;
        zone.frame = {
          ...zone.frame,
          ...updates,
        };
        Utils.getZonesInSameFlowGroup(master, zone)
          .filter((item) => item.id !== zone.id)
          .forEach((siblingZone) => {
            siblingZone.frame = {
              ...siblingZone.frame,
              ...(updates.y !== undefined ? { y: zone.frame.y } : {}),
              ...(updates.width !== undefined ? { width: zone.frame.width } : {}),
              ...(updates.height !== undefined ? { height: zone.frame.height } : {}),
            };
          });
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update zone frame ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => {
              const threadPage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
              const threadMaster = threadPage ? nextDocument.masters.items.find((item) => item.id === threadPage.masterId) : null;
              const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
              return threadZone?.flowGroupId
                ? threadZone.flowGroupId === zoneFlowGroupId
                : thread.sourceZoneId === zoneId;
            })
            .map((thread) => thread.id)
            .concat(state.pagination.invalidatedThreadIds),
        ),
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

  updateMasterZoneStyle: (masterId, zoneId, updates) =>
    set((state) => {
      let zoneFlowGroupId: string | undefined;
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const zone = master?.contentZones.find((item) => item.id === zoneId);
        if (!master || !zone || zone.scope === 'global-fixed' || zone.locked) {
          return;
        }

        zoneFlowGroupId = zone.flowGroupId;
        Utils.getZonesInSameFlowGroup(master, zone).forEach((groupZone) => {
          groupZone.style = {
            ...groupZone.style,
            ...updates,
          };
        });
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update zone style ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => {
              const threadPage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
              const threadMaster = threadPage ? nextDocument.masters.items.find((item) => item.id === threadPage.masterId) : null;
              const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
              return threadZone?.flowGroupId
                ? threadZone.flowGroupId === zoneFlowGroupId
                : thread.sourceZoneId === zoneId;
            })
            .map((thread) => thread.id)
            .concat(state.pagination.invalidatedThreadIds),
        ),
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

  updateMasterZoneMeta: (masterId, zoneId, updates) =>
    set((state) => {
      let zoneFlowGroupId: string | undefined;
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const zone = master?.contentZones.find((item) => item.id === zoneId);
        if (!master || !zone || zone.scope === 'global-fixed' || zone.locked) {
          return;
        }

        zoneFlowGroupId = zone.flowGroupId;
        if (typeof updates.name === 'string' && updates.name.trim()) {
          zone.name = updates.name.trim();
        }
        if ('slotKey' in updates) {
          const nextSlotKey = updates.slotKey?.trim() || undefined;
          if (master.mode === 'speaker-thread' && master.slotSchema?.length) {
            const allowedSlotKeys = new Set(master.slotSchema.map((slot) => slot.slotKey));
            zone.slotKey = nextSlotKey && allowedSlotKeys.has(nextSlotKey) ? nextSlotKey : zone.slotKey;
          } else {
            zone.slotKey = nextSlotKey;
          }
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

        Utils.getZonesInSameFlowGroup(master, zone)
          .filter((item) => item.id !== zone.id)
          .forEach((groupZone) => {
            if ('slotKey' in updates) {
              groupZone.slotKey = zone.slotKey;
            }
            if ('allowThreadContinuation' in updates && typeof updates.allowThreadContinuation === 'boolean') {
              groupZone.allowThreadContinuation = zone.allowThreadContinuation;
            }
          });

        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Update zone meta ${zoneId}`, nextDocument);
      const invalidatedThreadIds = Array.from(
        new Set(
          nextDocument.threads
            .filter((thread) => {
              const threadPage = nextDocument.pages.find((page) => page.id === thread.sourcePageId);
              const threadMaster = threadPage ? nextDocument.masters.items.find((item) => item.id === threadPage.masterId) : null;
              const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
              return threadZone?.flowGroupId
                ? threadZone.flowGroupId === zoneFlowGroupId
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
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        master.decorations.push({
          id: Utils.createId('decoration'),
          type: 'text',
          locked: false,
          scope: 'template-fixed',
          x: 72,
          y: 72,
          width: 180,
          height: 28,
          text: '새 마스터 텍스트',
        });
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Add master text decoration ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  addMasterShapeDecoration: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        master.decorations.push({
          id: Utils.createId('decoration'),
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
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Add master shape decoration ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  addMasterImageDecoration: (masterId, image) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master) {
          return;
        }

        const baseWidth = 180;
        const aspectRatio = image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalHeight / image.naturalWidth
          : 0.4;
        const baseHeight = Math.max(48, Math.round(baseWidth * aspectRatio));

        master.decorations.push({
          id: Utils.createId('decoration'),
          type: 'image',
          locked: false,
          scope: 'template-fixed',
          x: 72,
          y: 40,
          width: baseWidth,
          height: baseHeight,
          src: image.src,
          storagePath: image.storagePath,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        });
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Add master image decoration ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),
  removeMasterDecoration: (masterId, decorationId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const decoration = master?.decorations.find((item) => item.id === decorationId);
        if (!master || !decoration || decoration.scope === 'global-fixed' || decoration.locked) {
          return;
        }

        master.decorations = master.decorations.filter((item) => item.id !== decorationId);
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Remove decoration ${decorationId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  toggleMasterDecorationLock: (masterId, decorationId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const decoration = master?.decorations.find((item) => item.id === decorationId);
        if (!master || !decoration || decoration.scope === 'global-fixed') {
          return;
        }

        decoration.locked = !decoration.locked;
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Toggle decoration lock ${decorationId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  toggleMasterZoneLock: (masterId, zoneId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        const zone = master?.contentZones.find((item) => item.id === zoneId);
        if (!master || !zone || zone.scope === 'global-fixed') {
          return;
        }

        zone.locked = !zone.locked;
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Toggle zone lock ${zoneId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  addMasterTextZone: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || master.locked || master.mode === 'speaker-thread') {
          return;
        }

        const newZone = {
          ...createMainBodyZone(),
          id: Utils.createId('zone'),
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
        draft.pages.forEach((page) => {
          if (page.masterId === masterId && !page.zones.some((zone) => zone.zoneId === newZone.id)) {
            page.zones.push({ zoneId: newZone.id, blocks: [] });
          }
        });
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Add master text zone ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  addMasterImageZone: (masterId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || master.locked) {
          return;
        }

        const newZone = {
          ...createImageZone(`Image Zone ${master.contentZones.filter((zone) => zone.kind === 'media-freeform').length + 1}`),
          id: Utils.createId('zone'),
          frame: {
            x: 390,
            y: 120 + master.contentZones.length * 24,
            width: 220,
            height: 180,
          },
        };

        master.contentZones.push(newZone);
        draft.pages.forEach((page) => {
          if (page.masterId === masterId && !page.zones.some((zone) => zone.zoneId === newZone.id)) {
            page.zones.push({ zoneId: newZone.id, blocks: [] });
          }
        });
        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Add master image zone ${masterId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

  removeMasterZone: (masterId, zoneId) =>
    set((state) => {
      const nextDocument = produce(state.document, (draft) => {
        const master = draft.masters.items.find((item) => item.id === masterId);
        if (!master || master.contentZones.length <= 1) {
          return;
        }

        const hasContent = draft.pages.some((page) =>
          page.masterId === masterId && page.zones.some((zone) => zone.zoneId === zoneId && zone.blocks.length > 0),
        );
        if (hasContent) {
          return;
        }

        master.contentZones = master.contentZones.filter((zone) => zone.id !== zoneId);
        draft.pages.forEach((page) => {
          if (page.masterId === masterId) {
            page.zones = page.zones.filter((zone) => zone.zoneId !== zoneId);
          }
        });

        draft.meta.updatedAt = new Date().toISOString();
      });

      if (nextDocument === state.document) return state;

      const next = Utils.pushHistoryEntry(state, `Remove master zone ${zoneId}`, nextDocument);
      return {
        ...state,
        document: nextDocument,
        ...next,
      };
    }),

});
