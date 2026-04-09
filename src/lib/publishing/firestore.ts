import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
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
  threads: PublishingDocument['threads'];
  contributions: PublishingDocument['contributions'];
  toc: PublishingDocument['toc'];
  updatedAt: string;
  masters?: PublishingDocument['masters'];
}

interface PublishingMasterLibraryDoc {
  masters: PublishingDocument['masters'];
  updatedAt: string;
}

const looksLikeLegacyStarterDocument = (document: PublishingDocument) => {
  const hasNoContributions = !document.contributions?.length;
  const hasLegacyCoverPage = document.pages.some((page) => page.pageRole === 'cover' && page.masterId === 'master_cover');
  const hasLegacyStarterThreads = document.threads.some((thread) => thread.id === 'thread_cover_title' || thread.id === 'thread_body_main');
  return hasNoContributions && hasLegacyCoverPage && hasLegacyStarterThreads;
};

const migrateLegacyStarterDocument = (document: PublishingDocument) => {
  if (!looksLikeLegacyStarterDocument(document)) {
    return document;
  }

  const next = createInitialPublishingDocument(document.id);
  next.meta = {
    ...next.meta,
    ...document.meta,
    updatedAt: document.meta.updatedAt,
  };
  next.assets = document.assets;
  return next;
};

const metaRef = (publicationId: string) =>
  doc(db, 'publications', publicationId, 'editor', META_DOC_ID);

const masterLibraryRef = () =>
  doc(db, 'publishingGlobals', 'masterLibrary');

const pagesCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorPages');

const assetsCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorAssets');

const MAX_BATCH_OPS = 400;

const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      if (entry !== undefined) {
        acc[key] = stripUndefinedDeep(entry);
      }
      return acc;
    }, {}) as T;
  }

  return value;
};

export const loadPublishingDocument = async (publicationId: string) => {
  const [publicationSnap, metaSnap, masterLibrarySnap, pageSnaps, assetSnaps] = await Promise.all([
    getDoc(doc(db, 'publications', publicationId)),
    getDoc(metaRef(publicationId)),
    getDoc(masterLibraryRef()),
    getDocs(query(pagesCollection(publicationId), orderBy('pageNumber', 'asc'))),
    getDocs(assetsCollection(publicationId)),
  ]);

  const publicationData = publicationSnap.exists() ? publicationSnap.data() : null;
  const sourcePublicationType = publicationData?.type as PublishingDocument['meta']['sourcePublicationType'] | undefined;
  const globalMasters = masterLibrarySnap.exists()
    ? (masterLibrarySnap.data() as PublishingMasterLibraryDoc).masters
    : null;

  if (!metaSnap.exists()) {
    const initialDocument = createInitialPublishingDocument(publicationId);
    if (globalMasters) {
      initialDocument.masters = globalMasters;
      initialDocument.pages = initialDocument.pages.map((page) => ({
        ...page,
        masterId: globalMasters.defaultMasterId,
        zones: globalMasters.items.find((item) => item.id === globalMasters.defaultMasterId)?.contentZones.map((zone) => ({
          zoneId: zone.id,
          blocks: [],
        })) ?? [],
      }));
    }
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
    return migrateLegacyStarterDocument(initialDocument);
  }

  const meta = metaSnap.data() as PublishingMetaDoc;
  if (!globalMasters && meta.masters) {
    await setDoc(
      masterLibraryRef(),
      stripUndefinedDeep({
        masters: meta.masters,
        updatedAt: new Date().toISOString(),
      } satisfies PublishingMasterLibraryDoc),
    );
  }
  const pages = pageSnaps.docs.map((item) => item.data()) as PublishingDocument['pages'];
  const assets = assetSnaps.docs.map((item) => item.data()) as PublishingDocument['assets'];
  const masters = globalMasters ?? meta.masters ?? createInitialPublishingDocument(publicationId).masters;

  return migrateLegacyStarterDocument({
    id: publicationId,
    version: meta.version,
    meta: meta.meta,
    layout: meta.layout,
    masters,
    pages,
    threads: meta.threads,
    contributions: meta.contributions ?? [],
    toc: meta.toc,
    assets,
  } satisfies PublishingDocument);
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
    threads: documentState.threads,
    contributions: documentState.contributions,
    toc: documentState.toc,
    updatedAt: new Date().toISOString(),
  };
  const masterLibrary: PublishingMasterLibraryDoc = {
    masters: documentState.masters,
    updatedAt: new Date().toISOString(),
  };
  const sanitizedMeta = stripUndefinedDeep(meta);
  const sanitizedMasterLibrary = stripUndefinedDeep(masterLibrary);
  const sanitizedPages = documentState.pages.map((page) => stripUndefinedDeep(page));
  const sanitizedAssets = documentState.assets.map((asset) => stripUndefinedDeep(asset));

  operations.push((batch) => {
    batch.set(metaRef(publicationId), sanitizedMeta);
  });
  operations.push((batch) => {
    batch.set(masterLibraryRef(), sanitizedMasterLibrary);
  });

  const nextPageIds = new Set(documentState.pages.map((page) => page.id));
  existingPages.docs.forEach((page) => {
    if (!nextPageIds.has(page.id)) {
      operations.push((batch) => {
        batch.delete(page.ref);
      });
    }
  });
  sanitizedPages.forEach((page) => {
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
  sanitizedAssets.forEach((asset) => {
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
        editorUpdatedAt: sanitizedMeta.updatedAt,
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
