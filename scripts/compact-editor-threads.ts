import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { getChainRootPageId, inferZoneSlotKey } from '../src/lib/publishing/contributionLayout';
import type { PublishingDocument } from '../src/types/publishing';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ebook-c74b2' });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const [, , publicationId, ...flags] = process.argv;

if (!publicationId) {
  console.error('Usage: tsx scripts/compact-editor-threads.ts <publicationId> [--write]');
  process.exit(1);
}

const shouldWrite = flags.includes('--write');

type StoredThread = PublishingDocument['threads'][number] & {
  canonicalText?: PublishingDocument['threads'][number]['canonicalText'];
};

const findContributionSlotTextForThread = (
  pages: PublishingDocument['pages'],
  masters: PublishingDocument['masters'],
  contributions: PublishingDocument['contributions'],
  thread: Pick<PublishingDocument['threads'][number], 'sourcePageId' | 'sourceZoneId'>,
) => {
  const documentShape = {
    pages,
    masters,
    contributions,
  } as PublishingDocument;
  const rootPageId = getChainRootPageId(documentShape, thread.sourcePageId);
  const contribution = contributions.find((item) => item.pageId === rootPageId);
  if (!contribution) {
    return null;
  }

  const sourcePage = pages.find((page) => page.id === rootPageId) ?? pages.find((page) => page.id === thread.sourcePageId);
  const masterId = sourcePage?.masterId ?? contribution.masterId;
  const master = masters.items.find((item) => item.id === masterId);
  const zone = master?.contentZones.find((item) => item.id === thread.sourceZoneId);
  const slotKey = inferZoneSlotKey(zone);

  if (!slotKey) {
    return null;
  }

  return contribution.slots.find((slot) => slot.slotKey === slotKey)?.text ?? null;
};

const main = async () => {
  const publicationRef = db.collection('publications').doc(publicationId);
  const stateRef = publicationRef.collection('editor').doc('state');
  const pagesRef = publicationRef.collection('editorPages');
  const contributionsRef = publicationRef.collection('editorContributions');

  const [stateSnap, pagesSnap, contributionsSnap] = await Promise.all([
    stateRef.get(),
    pagesRef.orderBy('pageNumber', 'asc').get(),
    contributionsRef.orderBy('order', 'asc').get(),
  ]);

  if (!stateSnap.exists) {
    throw new Error(`Missing editor/state for publication ${publicationId}`);
  }

  const state = stateSnap.data() ?? {};
  const threads = ((state.threads ?? []) as StoredThread[]);
  const pages = pagesSnap.docs.map((doc) => doc.data()) as PublishingDocument['pages'];
  const contributions = contributionsSnap.docs.map((doc) => doc.data()) as PublishingDocument['contributions'];
  const masters = state.masters as PublishingDocument['masters'];

  let compactedCount = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  const compactedThreads = threads.map((thread) => {
    const serializedBefore = Buffer.byteLength(JSON.stringify(thread), 'utf8');
    bytesBefore += serializedBefore;

    const slotText = findContributionSlotTextForThread(pages, masters, contributions, thread);
    const threadText = (thread.canonicalText ?? []).map((run) => run.text).join('');

    if (slotText == null || slotText !== threadText) {
      bytesAfter += serializedBefore;
      return thread;
    }

    const { canonicalText, ...rest } = thread;
    const serializedAfter = Buffer.byteLength(JSON.stringify(rest), 'utf8');
    bytesAfter += serializedAfter;
    compactedCount += 1;
    return rest;
  });

  const summary = {
    publicationId,
    threadCount: threads.length,
    contributionCount: contributions.length,
    compactedThreads: compactedCount,
    bytesBefore,
    bytesAfter,
    savedBytes: bytesBefore - bytesAfter,
    savedKB: ((bytesBefore - bytesAfter) / 1024).toFixed(1),
    willWrite: shouldWrite,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    return;
  }

  const backupDir = path.join('/tmp', 'ebook-thread-compactions');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `${publicationId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );

  await fs.writeFile(
    backupPath,
    JSON.stringify({
      publicationId,
      capturedAt: new Date().toISOString(),
      state,
    }, null, 2),
    'utf8',
  );

  await stateRef.set({
    threads: compactedThreads,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  console.log(JSON.stringify({
    publicationId,
    backupPath,
    compactedThreads: compactedCount,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
