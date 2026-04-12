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
import {
  estimateCharsPerPage,
  findThreadForContributionSlot,
} from '@/lib/publishing/contributionLayout';
import { createInitialPublishingDocument } from '@/lib/publishing/defaultDocument';
import { getRecommendedPreset } from '@/lib/publishing/recommendations';
import {
  StoredThread,
} from '@/lib/publishing/threadTextSerialization';
import { applyPresetToMaster } from '@/lib/publishing/templatePresets';
import { PublishingDocument } from '@/types/publishing';
import isEqual from 'fast-deep-equal';

const META_DOC_ID = 'state';

interface PublishingMetaDoc {
  version: number;
  meta: PublishingDocument['meta'];
  layout: PublishingDocument['layout'];
  threads?: PublishingDocument['threads'];
  contributions?: PublishingDocument['contributions'];
  contributionCount?: number;
  contributionStorageVersion?: 1;
  defaultMasterId?: string;
  masterCount?: number;
  masterStorageVersion?: 1;
  toc: PublishingDocument['toc'];
  updatedAt: string;
  masters?: PublishingDocument['masters'];
}

interface PublishingMasterLibraryDoc {
  masters: PublishingDocument['masters'];
  updatedAt: string;
  schemaVersion?: 1;
  sourcePublicationTypes?: PublishingDocument['meta']['sourcePublicationType'][];
  publicationTypes?: PublishingDocument['meta']['publicationType'][];
}

type StoredMaster = PublishingDocument['masters']['items'][number] & {
  order?: number;
};

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

const contributionsCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorContributions');

const mastersCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorMasters');

const assetsCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorAssets');

const threadsCollection = (publicationId: string) =>
  collection(db, 'publications', publicationId, 'editorThreads');

const FIRESTORE_BATCH_LIMIT = 500;

interface SavePublishingDocumentOptions {
  persistGlobalMasters?: boolean;
}

type BatchOperation = (batch: ReturnType<typeof writeBatch>) => void;

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

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildStoredMasters = (documentState: PublishingDocument): StoredMaster[] =>
  documentState.masters.items.map((master, index) => ({
    ...stripUndefinedDeep(master),
    order: index,
  }));

const isCompatibleMasterSet = (
  masters: PublishingDocument['masters'] | null | undefined,
) => {
  if (!masters?.items?.length) {
    return false;
  }

  const defaultMaster = masters.items.find((master) => master.id === masters.defaultMasterId);
  if (!defaultMaster) {
    return false;
  }

  const allZonesValid = masters.items.every((master) =>
    master.contentZones.length > 0 && master.contentZones.every((zone) => Boolean(zone.id) && Boolean(zone.frame)),
  );
  if (!allZonesValid) {
    return false;
  }

  return true;
};

const resolveCompatibleGlobalMasters = (
  globalMasters: PublishingDocument['masters'] | null,
) => {
  if (!isCompatibleMasterSet(globalMasters)) {
    if (globalMasters) {
      console.warn('[publishing] ignoring incompatible global master library and falling back to defaults');
    }
    return null;
  }

  return globalMasters;
};

const resolveDocumentMasters = (
  publicationId: string,
  defaultMasterId: string | undefined,
  masterDocs: StoredMaster[],
  fallbackMasters: PublishingDocument['masters'] | null,
  globalMasters: PublishingDocument['masters'] | null,
) => {
  if (masterDocs.length) {
    const items = [...masterDocs]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map(({ order, ...master }) => master);
    return {
      defaultMasterId: defaultMasterId ?? items[0]?.id ?? createInitialPublishingDocument(publicationId).masters.defaultMasterId,
      items,
    } satisfies PublishingDocument['masters'];
  }

  if (fallbackMasters) {
    return fallbackMasters;
  }

  const compatibleGlobalMasters = resolveCompatibleGlobalMasters(globalMasters);
  if (compatibleGlobalMasters) {
    return compatibleGlobalMasters;
  }

  return createInitialPublishingDocument(publicationId).masters;
};

const validatePageSynchronization = (documentState: PublishingDocument) => {
  const minimumContributionPages = documentState.contributions.length;
  const suspiciousBodySlots = documentState.contributions.flatMap((contribution) =>
    contribution.slots
      .filter((slot) => slot.slotKey.startsWith('body') && slot.text.trim())
      .map((slot) => {
        const thread = findThreadForContributionSlot(documentState, contribution, slot.slotKey);
        const estimatedCapacity = estimateCharsPerPage(documentState, contribution.masterId, slot.slotKey, slot.text);
        return {
          contributionId: contribution.id,
          title: contribution.title || contribution.id,
          slotKey: slot.slotKey,
          slotLength: slot.text.trim().length,
          estimatedCapacity,
          renderedPages: thread?.zoneSequence.length ?? 0,
        };
      })
      .filter((entry) => entry.slotLength > entry.estimatedCapacity * 1.08 && entry.renderedPages <= 1),
  );

  if (documentState.pages.length < minimumContributionPages) {
    console.warn(
      `[publishing] page count looks too small before save: ${documentState.pages.length} pages for `
      + `${documentState.contributions.length} contributions`,
    );
  }

  if (suspiciousBodySlots.length > 0) {
    console.warn('[publishing] detected body slots that appear under-paginated before save', suspiciousBodySlots);
  }
};

const appendCollectionSyncOperations = <T extends { id: string }>(
  operations: BatchOperation[],
  existingDocs: Awaited<ReturnType<typeof getDocs>>['docs'],
  nextDocs: T[],
  getDocRef: (id: string) => ReturnType<typeof doc>,
) => {
  const nextIds = new Set(nextDocs.map((item) => item.id));

  existingDocs.forEach((existingDoc) => {
    if (!nextIds.has(existingDoc.id)) {
      operations.push((batch) => {
        batch.delete(existingDoc.ref);
      });
    }
  });

  nextDocs.forEach((nextDoc) => {
    operations.push((batch) => {
      batch.set(getDocRef(nextDoc.id), nextDoc);
    });
  });
};

const appendCollectionDeltaOperations = <T extends { id: string }>(
  operations: BatchOperation[],
  previousDocs: T[],
  nextDocs: T[],
  getDocRef: (id: string) => ReturnType<typeof doc>,
) => {
  const prevMap = new Map(previousDocs.map((item) => [item.id, item]));
  const nextMap = new Map(nextDocs.map((item) => [item.id, item]));

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      operations.push((batch) => {
        batch.delete(getDocRef(id));
      });
    }
  }

  for (const [id, nextDoc] of nextMap.entries()) {
    const prevDoc = prevMap.get(id);
    if (!prevDoc || hasChanged(prevDoc, nextDoc)) {
      operations.push((batch) => {
        batch.set(getDocRef(id), nextDoc);
      });
    }
  }
};

const commitOperations = async (operations: BatchOperation[]) => {
  if (operations.length <= FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.forEach((applyOperation) => applyOperation(batch));
    await batch.commit();
    return;
  }

  console.warn(
    `[publishing] save requires ${operations.length} operations; falling back to chunked batches, which is not fully atomic`,
  );

  for (let index = 0; index < operations.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((applyOperation) => applyOperation(batch));
    await batch.commit();
  }
};

const buildMetaDoc = (documentState: PublishingDocument): PublishingMetaDoc => ({
  version: documentState.version,
  meta: documentState.meta,
  layout: documentState.layout,
  contributionCount: documentState.contributions.length,
  contributionStorageVersion: 1,
  defaultMasterId: documentState.masters.defaultMasterId,
  masterCount: documentState.masters.items.length,
  masterStorageVersion: 1,
  toc: documentState.toc,
  updatedAt: new Date().toISOString(),
});

const hasChanged = (previousValue: unknown, nextValue: unknown) => !isEqual(previousValue, nextValue);

export const savePublishingMetaState = async (publicationId: string, documentState: PublishingDocument) => {
  const meta = stripUndefinedDeep(buildMetaDoc(documentState));
  await setDoc(metaRef(publicationId), meta);
  await setDoc(
    doc(db, 'publications', publicationId),
    {
      title: documentState.meta.title,
      status: documentState.meta.status,
      editorUpdatedAt: meta.updatedAt,
      publishingVersion: documentState.version,
    },
    { merge: true },
  );
};

export const savePublishingContributions = async (
  publicationId: string,
  contributions: PublishingDocument['contributions'],
  previousContributions?: PublishingDocument['contributions'],
) => {
  const operations: BatchOperation[] = [];
  const getDocRef = (id: string) => doc(contributionsCollection(publicationId), id);
  const sanitizedNext = contributions.map((contribution) => stripUndefinedDeep(contribution));

  if (previousContributions) {
    appendCollectionDeltaOperations(operations, previousContributions, sanitizedNext, getDocRef);
  } else {
    const existingContributions = await getDocs(contributionsCollection(publicationId));
    appendCollectionSyncOperations(operations, existingContributions.docs, sanitizedNext, getDocRef);
  }
  await commitOperations(operations);
};

export const savePublishingMasters = async (
  publicationId: string,
  masters: PublishingDocument['masters'],
  options: SavePublishingDocumentOptions = {},
) => {
  const { persistGlobalMasters = false } = options;
  const existingMasters = await getDocs(mastersCollection(publicationId));
  const operations: BatchOperation[] = [];

  appendCollectionSyncOperations(
    operations,
    existingMasters.docs,
    masters.items.map((master, index) => ({
      ...stripUndefinedDeep(master),
      order: index,
    })),
    (id) => doc(mastersCollection(publicationId), id),
  );

  operations.push((batch) => {
    batch.set(
      metaRef(publicationId),
      stripUndefinedDeep({
        defaultMasterId: masters.defaultMasterId,
        masterCount: masters.items.length,
        masterStorageVersion: 1,
        updatedAt: new Date().toISOString(),
      } satisfies Partial<PublishingMetaDoc>),
      { merge: true },
    );
  });

  if (persistGlobalMasters) {
    operations.push((batch) => {
      batch.set(masterLibraryRef(), stripUndefinedDeep({
        masters,
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
      } satisfies PublishingMasterLibraryDoc));
    });
  }

  await commitOperations(operations);
};

export const savePublishingPages = async (
  publicationId: string,
  pages: PublishingDocument['pages'],
  previousPages?: PublishingDocument['pages'],
) => {
  const operations: BatchOperation[] = [];
  const getDocRef = (id: string) => doc(pagesCollection(publicationId), id);
  const sanitizedNext = pages.map((page) => stripUndefinedDeep(page));

  if (previousPages) {
    appendCollectionDeltaOperations(operations, previousPages, sanitizedNext, getDocRef);
  } else {
    const existingPages = await getDocs(pagesCollection(publicationId));
    appendCollectionSyncOperations(operations, existingPages.docs, sanitizedNext, getDocRef);
  }
  await commitOperations(operations);
};

export const savePublishingAssets = async (
  publicationId: string,
  assets: PublishingDocument['assets'],
  previousAssets?: PublishingDocument['assets'],
) => {
  const operations: BatchOperation[] = [];
  const getDocRef = (id: string) => doc(assetsCollection(publicationId), id);
  const sanitizedNext = assets.map((asset) => stripUndefinedDeep(asset));

  if (previousAssets) {
    appendCollectionDeltaOperations(operations, previousAssets, sanitizedNext, getDocRef);
  } else {
    const existingAssets = await getDocs(assetsCollection(publicationId));
    appendCollectionSyncOperations(operations, existingAssets.docs, sanitizedNext, getDocRef);
  }
  await commitOperations(operations);
};

export const savePublishingThreads = async (
  publicationId: string,
  documentState: PublishingDocument,
  previousDocument?: PublishingDocument | null,
) => {
  const operations: BatchOperation[] = [];
  const getDocRef = (id: string) => doc(threadsCollection(publicationId), id);
  
  const nextThreads = documentState.threads.map((thread) => stripUndefinedDeep(thread)) as PublishingDocument['threads'];
  
  if (previousDocument) {
    const previousThreads = previousDocument.threads.map((thread) => stripUndefinedDeep(thread)) as PublishingDocument['threads'];
    appendCollectionDeltaOperations(operations, previousThreads, nextThreads, getDocRef);
  } else {
    const existingThreads = await getDocs(threadsCollection(publicationId));
    appendCollectionSyncOperations(operations, existingThreads.docs, nextThreads, getDocRef);
  }
  
  await commitOperations(operations);
};

export const saveEditorWorkspace = async (
  publicationId: string,
  documentState: PublishingDocument,
) => {
  validatePageSynchronization(documentState);
  await Promise.all([
    savePublishingContributions(publicationId, documentState.contributions),
    savePublishingPages(publicationId, documentState.pages),
    savePublishingAssets(publicationId, documentState.assets),
    savePublishingThreads(publicationId, documentState),
  ]);
  await savePublishingMetaState(publicationId, documentState);
};

export const saveEditorWorkspaceDelta = async (
  publicationId: string,
  previousDocument: PublishingDocument | null,
  nextDocument: PublishingDocument,
) => {
  validatePageSynchronization(nextDocument);

  const tasks: Promise<void>[] = [];
  if (!previousDocument || hasChanged(previousDocument.contributions, nextDocument.contributions)) {
    tasks.push(savePublishingContributions(publicationId, nextDocument.contributions, previousDocument?.contributions));
  }
  if (!previousDocument || hasChanged(previousDocument.pages, nextDocument.pages)) {
    tasks.push(savePublishingPages(publicationId, nextDocument.pages, previousDocument?.pages));
  }
  if (!previousDocument || hasChanged(previousDocument.assets, nextDocument.assets)) {
    tasks.push(savePublishingAssets(publicationId, nextDocument.assets, previousDocument?.assets));
  }
  if (!previousDocument || hasChanged(previousDocument.threads, nextDocument.threads)) {
    tasks.push(savePublishingThreads(publicationId, nextDocument, previousDocument));
  }

  await Promise.all(tasks);

  if (
    !previousDocument
    || hasChanged(buildMetaDoc(previousDocument), buildMetaDoc(nextDocument))
  ) {
    await savePublishingMetaState(publicationId, nextDocument);
  }
};

export const saveMasterStudioWorkspace = async (
  publicationId: string,
  documentState: PublishingDocument,
  options: SavePublishingDocumentOptions = {},
) => {
  await savePublishingMasters(publicationId, documentState.masters, options);
  await savePublishingMetaState(publicationId, documentState);
};

export const saveMasterStudioWorkspaceDelta = async (
  publicationId: string,
  previousDocument: PublishingDocument | null,
  nextDocument: PublishingDocument,
  options: SavePublishingDocumentOptions = {},
) => {
  if (!previousDocument || hasChanged(previousDocument.masters, nextDocument.masters)) {
    await savePublishingMasters(publicationId, nextDocument.masters, options);
  }

  if (
    !previousDocument
    || hasChanged(buildMetaDoc(previousDocument), buildMetaDoc(nextDocument))
  ) {
    await savePublishingMetaState(publicationId, nextDocument);
  }
};

export const loadPublishingDocument = async (publicationId: string) => {
  const [publicationSnap, metaSnap, masterLibrarySnap, pageSnaps, contributionSnaps, masterSnaps, assetSnaps] = await Promise.all([
    getDoc(doc(db, 'publications', publicationId)),
    getDoc(metaRef(publicationId)),
    getDoc(masterLibraryRef()),
    getDocs(query(pagesCollection(publicationId), orderBy('pageNumber', 'asc'))),
    getDocs(query(contributionsCollection(publicationId), orderBy('order', 'asc'))),
    getDocs(query(mastersCollection(publicationId), orderBy('order', 'asc'))),
    getDocs(assetsCollection(publicationId)),
  ]);

  const publicationData = publicationSnap.exists() ? publicationSnap.data() : null;
  const sourcePublicationType = publicationData?.type as PublishingDocument['meta']['sourcePublicationType'] | undefined;
  const globalMasters = masterLibrarySnap.exists()
    ? (masterLibrarySnap.data() as PublishingMasterLibraryDoc).masters
    : null;
  const compatibleGlobalMasters = resolveCompatibleGlobalMasters(globalMasters);

  if (!metaSnap.exists()) {
    const initialDocument = createInitialPublishingDocument(publicationId);
    if (compatibleGlobalMasters) {
      initialDocument.masters = cloneDeep(compatibleGlobalMasters);
      initialDocument.pages = initialDocument.pages.map((page) => ({
        ...page,
        masterId: initialDocument.masters.defaultMasterId,
        zones: initialDocument.masters.items.find((item) => item.id === initialDocument.masters.defaultMasterId)?.contentZones.map((zone) => ({
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
  const contributions = contributionSnaps.docs.map((item) => item.data()) as PublishingDocument['contributions'];
  const storedMasters = masterSnaps.docs.map((item) => item.data()) as StoredMaster[];
  const assets = assetSnaps.docs.map((item) => item.data()) as PublishingDocument['assets'];

  const masters = resolveDocumentMasters(
    publicationId,
    meta.defaultMasterId,
    storedMasters,
    meta.masters ?? null,
    compatibleGlobalMasters ?? null,
  );

  return migrateLegacyStarterDocument({
    id: publicationId,
    version: meta.version,
    meta: meta.meta,
    layout: meta.layout,
    masters: cloneDeep(masters),
    pages,
    threads: [], // Load threads strictly lazily to avoid UI blocking
    contributions: contributions.length ? contributions : (meta.contributions ?? []),
    toc: meta.toc,
    assets,
  } satisfies PublishingDocument);
};

export const loadPublishingThreads = async (publicationId: string): Promise<PublishingDocument['threads']> => {
  const [threadSnaps, metaSnap] = await Promise.all([
    getDocs(threadsCollection(publicationId)),
    getDoc(metaRef(publicationId)),
  ]);
  
  if (threadSnaps.docs.length > 0) {
    return threadSnaps.docs.map((item) => item.data()) as PublishingDocument['threads'];
  }
  
  // Migration fallback: if no threads in new collection, check legacy meta document
  if (metaSnap.exists()) {
    const meta = metaSnap.data() as PublishingMetaDoc;
    if (meta.threads && meta.threads.length > 0) {
      // Legacy threads were stored compacted, so they might have empty canonicalText.
      // Rehydration will be handled by loadThreads in the store.
      const operations: BatchOperation[] = [];
      const getDocRef = (id: string) => doc(threadsCollection(publicationId), id);
      appendCollectionSyncOperations(operations, [], meta.threads, getDocRef);
      await commitOperations(operations);
      
      return meta.threads as StoredThread[];
    }
  }
  
  return [];
};

export const savePublishingDocument = async (
  publicationId: string,
  documentState: PublishingDocument,
  options: SavePublishingDocumentOptions = {},
) => {
  const { persistGlobalMasters = false } = options;
  validatePageSynchronization(documentState);
  const [existingPages, existingContributions, existingMasters, existingAssets, existingThreads] = await Promise.all([
    getDocs(pagesCollection(publicationId)),
    getDocs(contributionsCollection(publicationId)),
    getDocs(mastersCollection(publicationId)),
    getDocs(assetsCollection(publicationId)),
    getDocs(threadsCollection(publicationId)),
  ]);
  const operations: BatchOperation[] = [];
  const sanitizedMeta = stripUndefinedDeep(buildMetaDoc(documentState));

  operations.push((batch) => {
    batch.set(metaRef(publicationId), sanitizedMeta);
  });
  if (persistGlobalMasters) {
    operations.push((batch) => {
      batch.set(masterLibraryRef(), stripUndefinedDeep({
        masters: documentState.masters,
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
        sourcePublicationTypes: [documentState.meta.sourcePublicationType].filter(Boolean),
        publicationTypes: [documentState.meta.publicationType].filter(Boolean),
      } satisfies PublishingMasterLibraryDoc));
    });
  }

  appendCollectionSyncOperations(
    operations,
    existingPages.docs,
    documentState.pages.map((page) => stripUndefinedDeep(page)),
    (id) => doc(pagesCollection(publicationId), id),
  );
  appendCollectionSyncOperations(
    operations,
    existingContributions.docs,
    documentState.contributions.map((contribution) => stripUndefinedDeep(contribution)),
    (id) => doc(contributionsCollection(publicationId), id),
  );
  appendCollectionSyncOperations(
    operations,
    existingMasters.docs,
    buildStoredMasters(documentState),
    (id) => doc(mastersCollection(publicationId), id),
  );
  appendCollectionSyncOperations(
    operations,
    existingAssets.docs,
    documentState.assets.map((asset) => stripUndefinedDeep(asset)),
    (id) => doc(assetsCollection(publicationId), id),
  );
  appendCollectionSyncOperations(
    operations,
    existingThreads.docs,
    documentState.threads.map((thread) => stripUndefinedDeep(thread)),
    (id) => doc(threadsCollection(publicationId), id),
  );

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
  await commitOperations(operations);
};
