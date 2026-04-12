import { getChainRootPageId, inferZoneSlotKey } from '@/lib/publishing/contributionLayout';
import { PublishingDocument } from '@/types/publishing';

export type StoredThread = PublishingDocument['threads'][number] & {
  canonicalText?: PublishingDocument['threads'][number]['canonicalText'];
};

export const findContributionSlotTextForThread = (
  documentState: Pick<PublishingDocument, 'pages' | 'masters' | 'contributions'>,
  thread: Pick<PublishingDocument['threads'][number], 'sourcePageId' | 'sourceZoneId'>,
) => {
  const rootPageId = getChainRootPageId(documentState as PublishingDocument, thread.sourcePageId);
  const contribution = documentState.contributions.find((item) => item.pageId === rootPageId);
  if (!contribution) {
    return null;
  }

  const sourcePage = documentState.pages.find((page) => page.id === rootPageId)
    ?? documentState.pages.find((page) => page.id === thread.sourcePageId);
  const masterId = sourcePage?.masterId ?? contribution.masterId;
  const master = documentState.masters.items.find((item) => item.id === masterId);
  const zone = master?.contentZones.find((item) => item.id === thread.sourceZoneId);
  const slotKey = inferZoneSlotKey(zone);

  if (!slotKey) {
    return null;
  }

  return contribution.slots.find((slot) => slot.slotKey === slotKey)?.text ?? null;
};

export const rehydrateContributionThreadText = (
  documentState: PublishingDocument,
  threads: StoredThread[],
) => threads.map((thread) => {
  if (thread.canonicalText?.length) {
    return thread as PublishingDocument['threads'][number];
  }

  const slotText = findContributionSlotTextForThread(documentState, thread);
  if (slotText == null) {
    return {
      ...thread,
      canonicalText: [],
    } as PublishingDocument['threads'][number];
  }

  return {
    ...thread,
    canonicalText: [{ text: slotText }],
  } as PublishingDocument['threads'][number];
});

export const compactContributionThreadText = (documentState: PublishingDocument) =>
  documentState.threads.map((thread) => {
    const slotText = findContributionSlotTextForThread(documentState, thread);
    const threadText = thread.canonicalText.map((run) => run.text).join('');
    const hasRichMarks = thread.canonicalText.some((run) => Boolean(run.marks?.bold || run.marks?.italic || run.marks?.underline));

    if (slotText == null || threadText !== slotText || hasRichMarks) {
      return thread;
    }

    const { canonicalText, ...rest } = thread;
    return rest;
  });
