import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { rebuildAllContributionLayouts } from '../src/lib/publishing/contributionLayout';
import type { PublishingDocument } from '../src/types/publishing';

const [, , publicationIdArg, ...flags] = process.argv;

if (!publicationIdArg) {
  console.error('Usage: npx tsx scripts/restore-editor-pages.ts <publicationId> [--write]');
  process.exit(1);
}

const publicationId = publicationIdArg;
const shouldWrite = flags.includes('--write');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ebook-c74b2' });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const stateRef = db.collection('publications').doc(publicationId).collection('editor').doc('state');
const pagesRef = db.collection('publications').doc(publicationId).collection('editorPages');

const createPageFromMaster = (
  document: PublishingDocument,
  masterId: string,
  pageNumber: number,
): PublishingDocument['pages'][number] | null => {
  const master = document.masters.items.find((item) => item.id === masterId);
  if (!master) {
    return null;
  }

  return {
    id: `page_restored_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageNumber,
    masterId,
    pageRole: 'body',
    zones: master.contentZones.map((zone) => ({
      zoneId: zone.id,
      blocks: [],
    })),
  };
};

const buildDocumentFromState = (
  state: Record<string, any>,
): PublishingDocument => ({
  id: publicationId,
  version: state.version || 1,
  meta: structuredClone(state.meta || {}),
  layout: structuredClone(state.layout || {}),
  masters: structuredClone(state.masters),
  pages: [],
  threads: structuredClone(state.threads || []),
  contributions: structuredClone(state.contributions || []),
  toc: structuredClone(state.toc || { items: [] }),
  assets: [],
});

async function main() {
  const [stateSnap, pagesSnap] = await Promise.all([
    stateRef.get(),
    pagesRef.orderBy('pageNumber', 'asc').get(),
  ]);

  if (!stateSnap.exists) {
    throw new Error(`Missing editor/state for ${publicationId}`);
  }

  const rawState = stateSnap.data() as Record<string, any>;
  const document = buildDocumentFromState(rawState);
  rebuildAllContributionLayouts(document, createPageFromMaster);

  const backup = {
    publicationId,
    createdAt: new Date().toISOString(),
    state: rawState,
    pages: pagesSnap.docs.map((pageDoc) => ({ id: pageDoc.id, ...pageDoc.data() })),
  };

  const summary = {
    publicationId,
    write: shouldWrite,
    beforePages: pagesSnap.size,
    afterPages: document.pages.length,
    contributions: document.contributions.length,
    threads: document.threads.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    return;
  }

  const backupDir = path.join('/tmp', 'ebook-page-restores');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `${publicationId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  const batch = db.batch();
  pagesSnap.docs.forEach((pageDoc) => {
    batch.delete(pageDoc.ref);
  });

  document.pages.forEach((page) => {
    batch.set(pagesRef.doc(page.id), page);
  });

  batch.set(
    stateRef,
    {
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  await batch.commit();
  console.log(`Backup written to ${backupPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
