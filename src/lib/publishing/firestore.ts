import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createInitialPublishingDocument } from '@/lib/publishing/defaultDocument';
import { getRecommendedPreset } from '@/lib/publishing/recommendations';
import { applyPresetToMaster } from '@/lib/publishing/templatePresets';
import { PublishingDocument } from '@/types/publishing';

const META_DOC_ID = 'state';

interface PublishingMetaDoc {
  version: number;
  meta: PublishingDocument['meta'];
  layout: PublishingDocument['layout'];
  masters: PublishingDocument['masters'];
  threads: PublishingDocument['threads'];
  toc: PublishingDocument['toc'];
  updatedAt: string;
}

const metaRef = (publicationId: string) =>
  doc(db, 'publications', publicationId, 'editor', META_DOC_ID);

const pagesCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorPages');

const assetsCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorAssets');

const MAX_BATCH_OPS = 400;

export const loadPublishingDocument = async (publicationId: string) => {
  const [publicationSnap, metaSnap, pageSnaps, assetSnaps] = await Promise.all([
    getDoc(doc(db, 'publications', publicationId)),
    getDoc(metaRef(publicationId)),
    getDocs(query(pagesCollection(publicationId), orderBy('pageNumber', 'asc'))),
    getDocs(assetsCollection(publicationId)),
  ]);

  const publicationData = publicationSnap.exists() ? publicationSnap.data() : null;
  const sourcePublicationType = publicationData?.type as PublishingDocument['meta']['sourcePublicationType'] | undefined;

  if (!metaSnap.exists()) {
    const initialDocument = createInitialPublishingDocument(publicationId);
    if (sourcePublicationType) {
      initialDocument.meta.sourcePublicationType = sourcePublicationType;
      const recommendedPreset = getRecommendedPreset(sourcePublicationType, initialDocument.meta.publicationType);
      const bodyMaster = initialDocument.masters.items.find((item) => item.id === initialDocument.masters.defaultMasterId);
      if (bodyMaster) {
        applyPresetToMaster(bodyMaster, recommendedPreset);
        const bodyPage = initialDocument.pages.find((page) => page.masterId === bodyMaster.id);
        const primaryZone =
          bodyMaster.contentZones
            .filter((zone) => zone.kind === 'text-flow')
            .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]
          ?? bodyMaster.contentZones[0];
        if (bodyPage && primaryZone) {
          bodyPage.zones = bodyMaster.contentZones.map((zone, index) => ({
            zoneId: zone.id,
            blocks: index === 0 ? bodyPage.zones.flatMap((pageZone) => pageZone.blocks) : [],
          }));
          initialDocument.threads.forEach((thread) => {
            if (thread.sourcePageId === bodyPage.id) {
              thread.sourceZoneId = primaryZone.id;
              thread.zoneSequence = [{ pageId: bodyPage.id, zoneId: primaryZone.id }];
            }
          });
        }
      }
    }
    return initialDocument;
  }

  const meta = metaSnap.data() as PublishingMetaDoc;
  const pages = pageSnaps.docs.map((item) => item.data()) as PublishingDocument['pages'];
  const assets = assetSnaps.docs.map((item) => item.data()) as PublishingDocument['assets'];

  return {
    id: publicationId,
    version: meta.version,
    meta: meta.meta,
    layout: meta.layout,
    masters: meta.masters,
    pages,
    threads: meta.threads,
    toc: meta.toc,
    assets,
  } satisfies PublishingDocument;
};

export const savePublishingDocument = async (publicationId: string, documentState: PublishingDocument) => {
  const [existingPages, existingAssets] = await Promise.all([
    getDocs(pagesCollection(publicationId)),
    getDocs(assetsCollection(publicationId)),
  ]);
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const meta: PublishingMetaDoc = {
    version: documentState.version,
    meta: documentState.meta,
    layout: documentState.layout,
    masters: documentState.masters,
    threads: documentState.threads,
    toc: documentState.toc,
    updatedAt: new Date().toISOString(),
  };

  operations.push((batch) => {
    batch.set(metaRef(publicationId), meta);
  });

  const nextPageIds = new Set(documentState.pages.map((page) => page.id));
  existingPages.docs.forEach((page) => {
    if (!nextPageIds.has(page.id)) {
      operations.push((batch) => {
        batch.delete(page.ref);
      });
    }
  });
  documentState.pages.forEach((page) => {
    operations.push((batch) => {
      batch.set(doc(pagesCollection(publicationId), page.id), page);
    });
  });

  const nextAssetIds = new Set(documentState.assets.map((asset) => asset.id));
  existingAssets.docs.forEach((asset) => {
    if (!nextAssetIds.has(asset.id)) {
      operations.push((batch) => {
        batch.delete(asset.ref);
      });
    }
  });
  documentState.assets.forEach((asset) => {
    operations.push((batch) => {
      batch.set(doc(assetsCollection(publicationId), asset.id), asset);
    });
  });

  operations.push((batch) => {
    batch.set(
      doc(db, 'publications', publicationId),
      {
        title: documentState.meta.title,
        status: documentState.meta.status,
        editorUpdatedAt: meta.updatedAt,
        publishingVersion: documentState.version,
      },
      { merge: true },
    );
  });

  for (let index = 0; index < operations.length; index += MAX_BATCH_OPS) {
    const batch = writeBatch(db);
    operations.slice(index, index + MAX_BATCH_OPS).forEach((applyOperation) => applyOperation(batch));
    await batch.commit();
  }
};
