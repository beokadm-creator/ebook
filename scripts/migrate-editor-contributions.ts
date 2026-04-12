import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'ebook-c74b2' });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const [, , publicationId, ...flags] = process.argv;

if (!publicationId) {
  console.error('Usage: tsx scripts/migrate-editor-contributions.ts <publicationId> [--write] [--force]');
  process.exit(1);
}

const shouldWrite = flags.includes('--write');
const shouldForce = flags.includes('--force');

const backupDir = path.join('/tmp', 'ebook-contribution-migrations');

const main = async () => {
  const publicationRef = db.collection('publications').doc(publicationId);
  const stateRef = publicationRef.collection('editor').doc('state');
  const contributionCollectionRef = publicationRef.collection('editorContributions');

  const [stateSnap, contributionSnap] = await Promise.all([
    stateRef.get(),
    contributionCollectionRef.orderBy('order', 'asc').get(),
  ]);

  if (!stateSnap.exists) {
    throw new Error(`Missing editor/state for publication ${publicationId}`);
  }

  const stateData = stateSnap.data() ?? {};
  const legacyContributions = Array.isArray(stateData.contributions) ? stateData.contributions : [];
  const existingContributions = contributionSnap.docs.map((doc) => doc.data());

  const summary = {
    publicationId,
    legacyContributionCount: legacyContributions.length,
    splitContributionCount: existingContributions.length,
    contributionStorageVersion: stateData.contributionStorageVersion ?? null,
    contributionCount: stateData.contributionCount ?? null,
    willWrite: shouldWrite,
    force: shouldForce,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    return;
  }

  if (!legacyContributions.length && !shouldForce) {
    console.log('No legacy contributions found in editor/state. Nothing to migrate.');
    return;
  }

  if (existingContributions.length > 0 && !shouldForce) {
    throw new Error(
      `editorContributions already contains ${existingContributions.length} documents. Use --force to overwrite.`,
    );
  }

  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${publicationId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  await fs.writeFile(
    backupPath,
    JSON.stringify({
      publicationId,
      capturedAt: new Date().toISOString(),
      state: stateData,
      splitContributions: existingContributions,
    }, null, 2),
    'utf8',
  );

  const batch = db.batch();

  contributionSnap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  legacyContributions.forEach((contribution: { id: string }) => {
    batch.set(contributionCollectionRef.doc(contribution.id), contribution);
  });

  batch.set(stateRef, {
    contributionCount: legacyContributions.length,
    contributionStorageVersion: 1,
    updatedAt: new Date().toISOString(),
    contributions: admin.firestore.FieldValue.delete(),
  }, { merge: true });

  await batch.commit();

  console.log(JSON.stringify({
    publicationId,
    backupPath,
    migratedContributions: legacyContributions.length,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
