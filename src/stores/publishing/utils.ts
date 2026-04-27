import { create } from 'zustand';
import { produce, current, isDraft } from 'immer';
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

import type { PublishingStore } from '../publishingStore';

export const AUTOSAVE_DEBOUNCE_MS = 1200;

let autosaveTimer: number | null = null;

export const clone = <T,>(value: T): T => {
  if (value === undefined) return value;
  const target = isDraft(value) ? current(value) : value;
  try {
    return typeof structuredClone === 'function' ? structuredClone(target) : JSON.parse(JSON.stringify(target));
  } catch {
    return JSON.parse(JSON.stringify(target));
  }
};

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
export const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const pushHistoryEntry = (state: PublishingStore, label: string, documentOverride?: PublishingDocument) => {
  const snapshot = documentOverride ?? state.document;
  const currentEntry: HistoryEntry = {
    document: snapshot, // Since we use Immer, snapshot is structurally shared and immutable. No deep copy needed.
    label,
    revision: state.history.revision,
    timestamp: new Date().toISOString(),
  };

  const nextUndoStack = [...state.history.undoStack, currentEntry].slice(-50);
  const nextRevision = state.history.revision + 1;

  return {
    history: {
      undoStack: nextUndoStack,
      redoStack: [],
      revision: nextRevision,
    },
    autosave: {
      ...state.autosave,
      dirty: true,
      pendingRevision: nextRevision,
    },
  };
};

export const normalizeMasterFlowGroups = (master: PublishingDocument['masters']['items'][number]) => {
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

export const buildContributionSlotsForMaster = (
  master: PublishingDocument['masters']['items'][number],
  slots: ContributionSlotContent[],
) => {
  const normalizedInput = slots.map((slot) => ({
    ...slot,
    text: normalizeContributionSlotText(slot.slotKey, slot.text),
  }));

  if (master.mode !== 'speaker-thread' || !master.slotSchema?.length) {
    return normalizedInput.filter((slot) => slot.text.trim());
  }

  const slotsByKey = new Map(normalizedInput.map((slot) => [slot.slotKey, slot]));
  const mapped: ContributionSlotContent[] = master.slotSchema.map((definition) => {
    const existing = slotsByKey.get(definition.slotKey);
    if (existing) {
      return {
        ...existing,
        label: existing.label || definition.label,
        role: existing.role || definition.role,
        language: existing.language ?? definition.language,
      };
    }
    return {
      slotKey: definition.slotKey,
      label: definition.label,
      role: definition.role,
      text: '',
      language: definition.language,
    } satisfies ContributionSlotContent;
  });

  normalizedInput.forEach((slot) => {
    if (!master.slotSchema?.some((definition) => definition.slotKey === slot.slotKey) && slot.text.trim()) {
      mapped.push({
        slotKey: slot.slotKey,
        label: slot.label,
        role: slot.role,
        text: slot.text,
        language: slot.language,
      });
    }
  });

  return mapped;
};

export const normalizeTrackText = (value?: string) => value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';

export const inferPresentationTrackId = (
  tracks: PresentationTrackOption[],
  trackText?: string,
  titleText?: string,
) => {
  const normalizedTrack = normalizeTrackText(trackText);
  const normalizedTitle = normalizeTrackText(titleText);
  if (!normalizedTrack && !normalizedTitle) {
    return undefined;
  }

  const exactPrefixMatch = tracks.find((item) => normalizedTrack.startsWith(item.prefix.toLowerCase()));
  if (exactPrefixMatch) {
    return exactPrefixMatch.id;
  }

  const exactHintMatch = tracks.find((item) =>
    [item.label, ...(item.glmHints ?? [])].some((hint) => {
      const normalizedHint = normalizeTrackText(hint);
      return normalizedTrack.includes(normalizedHint) || normalizedTitle.includes(normalizedHint);
    }),
  );
  return exactHintMatch?.id;
};

export const renumberContributionPresentationCodes = (document: PublishingDocument) => {
  const tracks = document.meta.presentationTracks?.length ? document.meta.presentationTracks : DEFAULT_PRESENTATION_TRACKS;
  const counters = new Map<string, number>();

  normalizeContributionOrder(document);
  document.contributions.forEach((contribution) => {
    const master = document.masters.items.find((item) => item.id === contribution.masterId);
    if (!master?.usesPresentationTracks) {
      contribution.presentationTrackId = undefined;
      contribution.presentationCode = undefined;
      return;
    }

    const trackId =
      contribution.presentationTrackId
      ?? inferPresentationTrackId(tracks, contribution.track, contribution.title);
    if (!trackId) {
      contribution.presentationTrackId = undefined;
      contribution.presentationCode = undefined;
      return;
    }

    const track = tracks.find((item) => item.id === trackId);
    if (!track) {
      contribution.presentationTrackId = undefined;
      contribution.presentationCode = undefined;
      return;
    }

    const nextIndex = (counters.get(track.id) ?? 0) + 1;
    counters.set(track.id, nextIndex);
    contribution.presentationTrackId = track.id;
    contribution.presentationCode = `${track.prefix}-${String(nextIndex).padStart(2, '0')}`;
  });
};

export const getPrimaryFlowZoneId = (document: PublishingDocument, masterId: string) => {
  const master = document.masters.items.find((item) => item.id === masterId);
  return (
    sortFlowZonesForReadingOrder(
      master?.contentZones.filter((zone) => zone.kind === 'text-flow') ?? [],
    )[0]?.id
    ?? master?.contentZones[0]?.id
    ?? null
  );
};

export const canReuseContributionPage = (document: PublishingDocument, pageId: string) => {
  const page = document.pages.find((item) => item.id === pageId);
  if (!page) {
    return false;
  }

  const rootPageId = getChainRootPageId(document, pageId);
  if ((document.contributions ?? []).some((item) => item.pageId === rootPageId)) {
    return false;
  }

  const hasThreads = document.threads.some((thread) => thread.sourcePageId === rootPageId);
  const hasBlocks = page.zones.some((zone) => zone.blocks.length > 0);
  return !hasThreads && !hasBlocks;
};

export const getThreadSlotKey = (document: PublishingDocument, thread: PublishingDocument['threads'][number]) => {
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

export const findExistingThreadForSlot = (
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

export const createPageFromMaster = (
  document: PublishingDocument,
  masterId: string,
  pageNumber: number,
): PublishingDocument['pages'][number] | null => {
  const master = document.masters.items.find((item) => item.id === masterId);
  if (!master) {
    return null;
  }

  return {
    id: createId('page'),
    pageNumber,
    masterId,
    pageRole: 'body',
    zones: master.contentZones.map((zone) => ({
      zoneId: zone.id,
      blocks: [],
    })),
  };
};

export const renameZoneForMaster = (zone: PublishingDocument['masters']['items'][number]['contentZones'][number]) => {
  const newStyle = zone.style
    ? {
        ...zone.style,
        fontWeight: Number(zone.style.fontWeight) || 400,
      }
    : {
        fontFamily: 'Noto Serif KR',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.6,
        letterSpacing: -0.02,
        textAlign: 'left' as const,
        color: '#000000',
      };

  return {
    ...zone,
    id: createId(zone.id || 'zone'),
    style: newStyle,
  };
};

export const renameDecorationForMaster = (decoration: PublishingDocument['masters']['items'][number]['decorations'][number]) => {
  if (decoration.scope === 'global-fixed') {
    return decoration;
  }

  return {
    ...decoration,
    id: createId(decoration.id || 'decoration'),
  };
};

export const getRoleStyleOverride = (role: TextRole) => {
  switch (role) {
    case 'title':
      return { fontSize: 30, fontWeight: 700, lineHeight: 1.4 };
    case 'heading':
      return { fontSize: 24, fontWeight: 700, lineHeight: 1.45 };
    case 'subheading':
      return { fontSize: 18, fontWeight: 700, lineHeight: 1.5 };
    case 'quote':
      return { fontSize: 16, fontWeight: 400, lineHeight: 1.9 };
    case 'caption':
      return { fontSize: 12, fontWeight: 400, lineHeight: 1.6 };
    default:
      return undefined;
  }
};

export const findTextBlockByThreadId = (document: PublishingDocument, threadId: string) => {
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

export const getZonesInSameFlowGroup = (
  master: PublishingDocument['masters']['items'][number],
  zone: PublishingDocument['masters']['items'][number]['contentZones'][number],
) => {
  if (!zone.flowGroupId) {
    return [zone];
  }

  return master.contentZones.filter((item) => item.flowGroupId === zone.flowGroupId);
};

export const mergeRuns = (runs: TextRun[]) => {
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

export const normalizeContributionSlotText = (slotKey: string, text: string) => {
  const trimmed = text.trim();
  if (/^body(_ko|_en)?$/.test(slotKey)) {
    const bodyTrimmed = text.replace(/^\s+/, '').replace(/[ \t]+$/, '');
    return normalizeStructuredBodyText(bodyTrimmed);
  }

  return trimmed;
};

export const trimThreadFromPage = (document: PublishingDocument, threadId: string, pageId: string) => {
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

export const syncTocFromThreads = (document: PublishingDocument) => {
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

export const sanitizeSpeakerThreadMaster = (master: PublishingDocument['masters']['items'][number]) => {
  if (master.mode !== 'speaker-thread' || !master.slotSchema?.length) {
    return master;
  }

  if (master.usesPresentationTracks === undefined) {
    master.usesPresentationTracks = true;
  }

  const allowedSlotKeys = new Set(master.slotSchema.map((slot) => slot.slotKey));
  master.contentZones = master.contentZones.filter((zone) => {
    if (zone.kind !== 'text-flow') {
      return true;
    }

    const inferredSlotKey = inferZoneSlotKey(zone);
    const slotKey = zone.slotKey?.trim() || inferredSlotKey;
    if (!slotKey || !allowedSlotKeys.has(slotKey)) {
      return false;
    }

    zone.slotKey = slotKey;
    return true;
  });

  if (!master.decorations.some((decoration) => decoration.textBinding === 'presentation.code')) {
    master.decorations.unshift({
      id: 'speaker_thread_presentation_code',
      type: 'text',
      locked: false,
      scope: 'template-fixed',
      x: 642,
      y: 82,
      width: 80,
      height: 24,
      textBinding: 'presentation.code',
      style: {
        fontFamily: 'NanumSquareBold',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'right',
        color: '#334155',
      },
    });
  }

  master.contentZones.forEach((zone) => {
    if (zone.id === 'speaker_track') {
      zone.frame = { ...zone.frame, x: 72, y: 82, width: 650, height: 26 };
    }
    if (zone.id === 'speaker_title_ko' || zone.id === 'speaker_title_en') {
      zone.frame = { ...zone.frame, x: 72, y: 126, width: 650, height: 78 };
    }
    if (zone.id === 'speaker_authors_ko' || zone.id === 'speaker_authors_en') {
      zone.frame = { ...zone.frame, x: 72, y: 218, width: 650, height: 28 };
    }
    if (zone.id === 'speaker_affiliation_ko' || zone.id === 'speaker_affiliation_en') {
      zone.frame = { ...zone.frame, x: 72, y: 256, width: 650, height: 28 };
    }
    if (zone.id === 'speaker_body_ko' || zone.id === 'speaker_body_en') {
      zone.frame = { ...zone.frame, x: 72, y: 328, width: 650, height: 668 };
    }
  });

  master.decorations = master.decorations.map((decoration) => {
    if (decoration.id === 'speaker_thread_presentation_code') {
      return {
        ...decoration,
        style: {
          fontFamily: 'NanumSquareBold',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: 0,
          textAlign: 'right',
          color: '#334155',
          ...(decoration.style ?? {}),
        },
      };
    }

    if (decoration.id === 'speaker_thread_page_number') {
      return {
        ...decoration,
        x: 670,
        y: 1072,
        width: 50,
        height: 20,
        style: {
          fontFamily: 'NanumSquareBold',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: 0,
          textAlign: 'right',
          color: '#334155',
          ...(decoration.style ?? {}),
        },
      };
    }

    return decoration;
  });

  return master;
};

export const sanitizePublishingDocument = (document: PublishingDocument): PublishingDocument => {
  return produce(document, (draft) => {
    draft.masters.items = draft.masters.items
      .filter((master) => Boolean(master))
      .map((master) => ({
        ...master,
        decorations: (master.decorations ?? []).filter((decoration) => Boolean(decoration)),
        contentZones: (master.contentZones ?? []).filter((zone) => Boolean(zone?.id) && Boolean(zone?.frame)),
      }))
      .map((master) => sanitizeSpeakerThreadMaster(master));

    draft.masters.items.forEach((master) => {
      master.decorations = master.decorations.map((decoration) => {
        if (decoration.type !== 'image' || decoration.src) {
          return decoration;
        }

        const linkedAsset = draft.assets.find((asset) => asset.id === decoration.assetId);
        if (!linkedAsset) {
          return decoration;
        }

        return {
          ...decoration,
          src: linkedAsset.src,
          storagePath: linkedAsset.storagePath,
          naturalWidth: linkedAsset.naturalWidth,
          naturalHeight: linkedAsset.naturalHeight,
        };
      });
    });

    draft.masters.items.forEach((master) => {
      normalizeMasterFlowGroups(master);
    });

    draft.pages = draft.pages
      .filter((page) => Boolean(page))
      .map((page) => {
        const master = draft.masters.items.find((item) => item.id === page.masterId);
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

    draft.threads = (draft.threads ?? [])
      .filter((thread) => Boolean(thread))
      .map((thread) => {
        const sourcePage = draft.pages.find((page) => page.id === thread.sourcePageId);
        if (!sourcePage) {
          return thread;
        }

        const rootPageId = getChainRootPageId(draft, sourcePage.id);
        const normalizedSourceZoneId = getFlowStartZoneId(draft, sourcePage.masterId, thread.sourceZoneId);
        return {
          ...thread,
          sourcePageId: rootPageId,
          sourceZoneId: normalizedSourceZoneId,
          zoneSequence: [{ pageId: rootPageId, zoneId: normalizedSourceZoneId }],
        };
      })
      .filter((thread) => {
        const sourcePage = draft.pages.find((page) => page.id === thread.sourcePageId);
        return sourcePage?.zones.some((zone) => zone.zoneId === thread.sourceZoneId) ?? false;
      });

    draft.threads.forEach((thread) => {
      const sourcePage = draft.pages.find((page) => page.id === thread.sourcePageId);
      const master = sourcePage ? draft.masters.items.find((item) => item.id === sourcePage.masterId) : null;
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
    draft.threads.forEach((thread) => {
      const slotKey = getThreadSlotKey(draft, thread);
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
    draft.threads = Array.from(mergedThreads.values());
    draft.contributions = (draft.contributions ?? [])
      .filter((contribution) => Boolean(contribution))
      .map((contribution, index) => ({
        ...contribution,
        order: contribution.order ?? index + 1,
        slots: (contribution.slots ?? []).filter((slot) => Boolean(slot?.slotKey)),
      }));
    draft.meta.presentationTracks = draft.meta.presentationTracks?.length
      ? draft.meta.presentationTracks
      : DEFAULT_PRESENTATION_TRACKS;
    renumberContributionPresentationCodes(draft);
    draft.assets = (draft.assets ?? []).filter((asset) => Boolean(asset));
    draft.toc.items = (draft.toc.items ?? []).filter((item) => Boolean(item));

    if (draft.threads.length) {
      syncTocFromThreads(draft);
    }
  });
};

export const createStoreState = (document?: PublishingDocument): PublishingEditorState & { isThreadsLoaded: boolean } => ({
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
  isThreadsLoaded: false,
});

