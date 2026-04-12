import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

type MasterLibraryDoc = {
  masters?: {
    defaultMasterId: string;
    items: Array<Record<string, unknown> & { id: string }>;
  };
  updatedAt?: string;
  schemaVersion?: number;
};

const args = process.argv.slice(2);

const getFlag = (name: string) => args.includes(name);
const getArg = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
};

const shouldWrite = getFlag('--write');
const alsoWriteStateMasters = getFlag('--alsoStateMasters');
const projectId = getArg('--project') ?? 'ebook-c74b2';
const limitRaw = getArg('--limit');
const limit = limitRaw ? Number(limitRaw) : undefined;
const backupDir = getArg('--backupDir') ?? path.join('/tmp', 'ebook-global-master-apply-backups');

const emulatorHost = getArg('--emulatorHost'); // ex) localhost:8080
if (emulatorHost) {
  process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const isoNow = () => new Date().toISOString();

const commitInChunks = async (ops: Array<(batch: admin.firestore.WriteBatch) => void>, chunkSize = 450) => {
  for (const group of chunk(ops, chunkSize)) {
    const batch = db.batch();
    group.forEach((apply) => apply(batch));
    await batch.commit();
  }
};

async function main() {
  const globalSnap = await db.collection('publishingGlobals').doc('masterLibrary').get();
  if (!globalSnap.exists) {
    throw new Error("publishingGlobals/masterLibrary 문서가 없습니다. 먼저 마스터 스튜디오에서 '마스터 저장'을 실행해 전역 라이브러리를 생성하세요.");
  }

  const globalDoc = globalSnap.data() as MasterLibraryDoc;
  const globalMasters = globalDoc.masters;
  if (!globalMasters?.defaultMasterId || !Array.isArray(globalMasters.items) || globalMasters.items.length === 0) {
    throw new Error('publishingGlobals/masterLibrary.masters 구조가 올바르지 않습니다.');
  }

  const publicationsSnap = await db.collection('publications').get();
  const publicationDocs = limit ? publicationsSnap.docs.slice(0, limit) : publicationsSnap.docs;

  console.log(JSON.stringify({
    mode: shouldWrite ? 'WRITE' : 'DRY_RUN',
    projectId,
    emulatorHost: emulatorHost ?? null,
    publicationsTotal: publicationsSnap.size,
    publicationsSelected: publicationDocs.length,
    globalMasterCount: globalMasters.items.length,
    globalDefaultMasterId: globalMasters.defaultMasterId,
    backupDir: shouldWrite ? backupDir : null,
    alsoWriteStateMasters,
  }, null, 2));

  if (shouldWrite) {
    await fs.mkdir(backupDir, { recursive: true });
  }

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const pub of publicationDocs) {
    const publicationId = pub.id;
    const publicationRef = db.collection('publications').doc(publicationId);
    const stateRef = publicationRef.collection('editor').doc('state');
    const mastersRef = publicationRef.collection('editorMasters');

    try {
      const [stateSnap, existingMastersSnap] = await Promise.all([
        stateRef.get(),
        mastersRef.get(),
      ]);

      const backup = {
        publicationId,
        capturedAt: isoNow(),
        publication: pub.data(),
        state: stateSnap.exists ? stateSnap.data() : null,
        editorMasters: existingMastersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      };

      const summary = {
        publicationId,
        write: shouldWrite,
        beforeMasters: existingMastersSnap.size,
        afterMasters: globalMasters.items.length,
      };

      if (!shouldWrite) {
        console.log(JSON.stringify(summary));
        skipped += 1;
        continue;
      }

      const backupPath = path.join(
        backupDir,
        `${publicationId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      );
      await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');

      const ops: Array<(batch: admin.firestore.WriteBatch) => void> = [];

      existingMastersSnap.docs.forEach((docSnap) => {
        ops.push((batch) => batch.delete(docSnap.ref));
      });

      globalMasters.items.forEach((master, index) => {
        const id = String((master as any).id);
        ops.push((batch) => batch.set(mastersRef.doc(id), { ...master, order: index }));
      });

      ops.push((batch) => batch.set(
        stateRef,
        {
          defaultMasterId: globalMasters.defaultMasterId,
          masterCount: globalMasters.items.length,
          masterStorageVersion: 1,
          updatedAt: isoNow(),
          ...(alsoWriteStateMasters ? { masters: globalMasters } : {}),
        },
        { merge: true },
      ));

      await commitInChunks(ops, 450);

      console.log(JSON.stringify({ ...summary, backupPath }));
      applied += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        publicationId,
        error: (error as Error).message ?? String(error),
      }));
    }
  }

  console.log(JSON.stringify({
    doneAt: isoNow(),
    mode: shouldWrite ? 'WRITE' : 'DRY_RUN',
    applied,
    skipped,
    failed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

