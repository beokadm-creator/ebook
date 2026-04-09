import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase';

const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export const getRenderableImageUrl = (src?: string | null) => {
  if (!src) {
    return '';
  }

  if (!src.startsWith('https://firebasestorage.googleapis.com/')) {
    return src;
  }

  const encoded = encodeURIComponent(src);
  return `/api/assets?src=${encoded}`;
};

export const readImageDimensions = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지 크기를 읽을 수 없습니다.'));
    };

    image.src = objectUrl;
  });

export const uploadPublicationImage = (
  publicationId: string,
  file: File,
  onProgress?: (progress: number) => void,
) =>
  new Promise<{
    src: string;
    storagePath: string;
    naturalWidth: number;
    naturalHeight: number;
  }>(/* eslint-disable-line no-async-promise-executor */ async (resolve, reject) => {
    try {
      if (!file.type.startsWith('image/')) {
        reject(new Error('이미지 파일만 업로드할 수 있습니다.'));
        return;
      }

      const dimensions = await readImageDimensions(file);
      const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
      const storagePath = `publications/${publicationId}/assets/${filename}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      task.on(
        'state_changed',
        (snapshot) => {
          if (!onProgress) {
            return;
          }

          const progress = snapshot.totalBytes
            ? snapshot.bytesTransferred / snapshot.totalBytes
            : 0;
          onProgress(progress);
        },
        (error) => reject(error),
        async () => {
          const src = await getDownloadURL(task.snapshot.ref);
          resolve({
            src,
            storagePath,
            naturalWidth: dimensions.width,
            naturalHeight: dimensions.height,
          });
        },
      );
    } catch (error) {
      reject(error);
    }
  });

export const uploadMasterImage = (
  file: File,
  onProgress?: (progress: number) => void,
) =>
  new Promise<{
    src: string;
    storagePath: string;
    naturalWidth: number;
    naturalHeight: number;
  }>(/* eslint-disable-line no-async-promise-executor */ async (resolve, reject) => {
    try {
      if (!file.type.startsWith('image/')) {
        reject(new Error('이미지 파일만 업로드할 수 있습니다.'));
        return;
      }

      const dimensions = await readImageDimensions(file);
      const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
      const storagePath = `publishingGlobals/master-assets/${filename}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      task.on(
        'state_changed',
        (snapshot) => {
          if (!onProgress) {
            return;
          }

          const progress = snapshot.totalBytes
            ? snapshot.bytesTransferred / snapshot.totalBytes
            : 0;
          onProgress(progress);
        },
        (error) => reject(error),
        async () => {
          const src = await getDownloadURL(task.snapshot.ref);
          resolve({
            src,
            storagePath,
            naturalWidth: dimensions.width,
            naturalHeight: dimensions.height,
          });
        },
      );
    } catch (error) {
      reject(error);
    }
  });
