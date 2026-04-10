import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { deleteObject, listAll, ref } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

const MAX_BATCH_OPS = 400;

const commitInChunks = async (refs: Array<QueryDocumentSnapshot | ReturnType<typeof doc>>) => {
  for (let index = 0; index < refs.length; index += MAX_BATCH_OPS) {
    const batch = writeBatch(db);
    refs.slice(index, index + MAX_BATCH_OPS).forEach((item) => {
      if ('ref' in item) {
        batch.delete(item.ref);
        return;
      }

      batch.delete(item);
    });
    await batch.commit();
  }
};

const deleteStorageFolderRecursive = async (path: string) => {
  const folderRef = ref(storage, path);

  try {
    const listing = await listAll(folderRef);
    await Promise.all(listing.items.map((item) => deleteObject(item)));
    await Promise.all(listing.prefixes.map((prefix) => deleteStorageFolderRecursive(prefix.fullPath)));
  } catch (error) {
    const storageError = error as { code?: string };
    if (storageError.code === 'storage/object-not-found') {
      return;
    }
    throw error;
  }
};

export const deletePublicationCascade = async (publicationId: string) => {
  const publicationRef = doc(db, 'publications', publicationId);
  const publicationSnap = await getDoc(publicationRef);
  if (!publicationSnap.exists()) {
    await deleteStorageFolderRecursive(`publications/${publicationId}`);
    return;
  }

  const [editorDocs, editorPages, editorAssets, articleDocs] = await Promise.all([
    getDocs(collection(db, 'publications', publicationId, 'editor')),
    getDocs(collection(db, 'publications', publicationId, 'editorPages')),
    getDocs(collection(db, 'publications', publicationId, 'editorAssets')),
    getDocs(collection(db, 'publications', publicationId, 'articles')),
  ]);

  const deleteTargets: Array<QueryDocumentSnapshot | ReturnType<typeof doc>> = [
    ...editorDocs.docs,
    ...editorPages.docs,
    ...editorAssets.docs,
  ];

  for (const articleDoc of articleDocs.docs) {
    const [contentBlocks, footnotes] = await Promise.all([
      getDocs(collection(articleDoc.ref, 'contentBlocks')),
      getDocs(collection(articleDoc.ref, 'footnotes')),
    ]);
    deleteTargets.push(...contentBlocks.docs, ...footnotes.docs, articleDoc);
  }

  deleteTargets.push(publicationRef);
  await commitInChunks(deleteTargets);
  await deleteStorageFolderRecursive(`publications/${publicationId}`);
};

export const deleteConferenceCascade = async (conferenceId: string) => {
  const linkedPublications = await getDocs(
    query(collection(db, 'publications'), where('conferenceId', '==', conferenceId)),
  );

  for (const publicationDoc of linkedPublications.docs) {
    await deletePublicationCascade(publicationDoc.id);
  }

  await deleteDoc(doc(db, 'conferences', conferenceId));
};
