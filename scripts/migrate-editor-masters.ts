import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import type { PublishingDocument } from '../src/types/publishing';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ebook-c74b2' });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const [, , publicationId, ...flags] = process.argv;

if (!publicationId) {
  console.error('Usage: tsx scripts/migrate-editor-masters.ts <publicationId> [--write] [--force]');
  process.exit(1);
}

const shouldWrite = flags.includes('--write');
const shouldForce = flags.includes('--force');

type StoredMaster = PublishingDocument['masters']['items'][number] & {
  order?: number;
};

const backupDir = path.join('/tmp', 'ebook-master-migrations');

const main = async () => {
  const publicationRef = db.collection('publications').doc(publicationId);
  const stateRef = publicationRef.collection('editor').doc('state');
  const mastersRef = publicationRef.collection('editorMasters');

  const [stateSnap, masterSnap] = await Promise.all([
    stateRef.get(),
    mastersRef.orderBy('order', 'asc').get(),
  ]);

  if (!stateSnap.exists) {
    throw new Error(`Missing editor/state for publication ${publicationId}`);
  }

  const state = stateSnap.data() ?? {};
  const legacyMasters = (state.masters as PublishingDocument['masters'] | undefined) ?? null;
  const splitMasters = masterSnap.docs.map((doc) => doc.data()) as StoredMaster[];

  const summary = {
    publicationId,
    legacyMasterCount: legacyMasters?.items.length ?? 0,
    splitMasterCount: splitMasters.length,
    defaultMasterId: state.defaultMasterId ?? legacyMasters?.defaultMasterId ?? null,
    masterStorageVersion: state.masterStorageVersion ?? null,
    masterCount: state.masterCount ?? null,
    willWrite: shouldWrite,
    force: shouldForce,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    return;
  }

  if (!legacyMasters && !shouldForce) {
    console.log('No legacy masters found in editor/state. Nothing to migrate.');
    return;
  }

  if (splitMasters.length > 0 && !shouldForce) {
    throw new Error(`editorMasters already contains ${splitMasters.length} documents. Use --force to overwrite.`);
  }

  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${publicationId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(
    backupPath,
    JSON.stringify({
      publicationId,
      capturedAt: new Date().toISOString(),
      state,
      splitMasters,
    }, null, 2),
    'utf8',
  );

  const batch = db.batch();

  masterSnap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  (legacyMasters?.items ?? []).forEach((master, index) => {
    batch.set(mastersRef.doc(master.id), { ...master, order: index });
  });

  batch.set(stateRef, {
    defaultMasterId: legacyMasters?.defaultMasterId ?? state.defaultMasterId ?? null,
    masterCount: legacyMasters?.items.length ?? 0,
    masterStorageVersion: 1,
    updatedAt: new Date().toISOString(),
    masters: admin.firestore.FieldValue.delete(),
  }, { merge: true });

  await batch.commit();

  console.log(JSON.stringify({
    publicationId,
    backupPath,
    migratedMasters: legacyMasters?.items.length ?? 0,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
