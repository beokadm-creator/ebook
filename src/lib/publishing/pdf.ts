import { PagePreset } from '@/types/publishing';

const imageDataUrlCache = new Map<string, string>();

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('이미지 데이터를 읽을 수 없습니다.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('이미지 데이터를 읽을 수 없습니다.'));
    reader.readAsDataURL(blob);
  });

const inlineImagesForCapture = async (page: HTMLElement) => {
  const images = Array.from(page.querySelectorAll('img')) as HTMLImageElement[];
  const restoreStack: Array<() => void> = [];

  await Promise.all(
    images.map(async (image) => {
      const source = image.currentSrc || image.getAttribute('src') || '';
      if (!source || source.startsWith('data:') || source.startsWith('blob:')) {
        return;
      }

      try {
        const safeSource = source;
        const cached = imageDataUrlCache.get(safeSource);
        const dataUrl: string = cached ?? await fetch(safeSource, { mode: 'cors', credentials: 'omit' })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`image fetch failed: ${response.status}`);
            }
            return response.blob();
          })
          .then((blob) => blobToDataUrl(blob));

        if (!cached) {
          imageDataUrlCache.set(safeSource, dataUrl);
        }

        const originalSrc = image.getAttribute('src') ?? safeSource;
        restoreStack.push(() => {
          image.setAttribute('src', originalSrc);
        });
        image.setAttribute('src', dataUrl);
      } catch {
        return;
      }
    }),
  );

  return () => {
    restoreStack.forEach((restore) => restore());
  };
};

const waitForImageReady = (image: HTMLImageElement, timeoutMs = 4000) =>
  new Promise<void>((resolve) => {
    if (image.complete) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      image.removeEventListener('load', handleDone);
      image.removeEventListener('error', handleDone);
    };

    const handleDone = () => {
      cleanup();
      resolve();
    };

    image.addEventListener('load', handleDone, { once: true });
    image.addEventListener('error', handleDone, { once: true });
  });

const waitForImages = async (page: HTMLElement) => {
  const images = Array.from(page.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    images.map(async (image) => {
      if (image.complete) {
        return;
      }

      try {
        await image.decode();
      } catch {
        await waitForImageReady(image);
      }
    }),
  );
};

export const downloadPagesAsPdf = async (
  pages: HTMLElement[],
  title: string,
  preset?: PagePreset,
  onProgress?: (current: number, total: number) => void,
) => {
  if (!pages.length) {
    return;
  }

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  if ('fonts' in document) {
    await document.fonts.ready;
  }

  const sanitizedTitle = (title || 'publication').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'publication';

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [preset?.widthMm ?? 210, preset?.heightMm ?? 297],
    compress: true,
  });

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const restoreImages = await inlineImagesForCapture(page);
    try {
      if (onProgress) {
        onProgress(index, pages.length);
      }
      await waitForImages(page);
      const canvas = await html2canvas(page, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        removeContainer: true,
        scrollX: 0,
        scrollY: 0,
        width: preset?.widthPx ?? page.offsetWidth,
        height: preset?.heightPx ?? page.offsetHeight,
        windowWidth: preset?.widthPx ?? page.offsetWidth,
        windowHeight: preset?.heightPx ?? page.offsetHeight,
        onclone: (_clonedDocument, clonedElement) => {
          clonedElement.querySelectorAll('.editor-guide, .editor-handle, .editor-toolbar, .editor-sidebar').forEach((node) => {
            (node as HTMLElement).style.display = 'none';
          });
          clonedElement.querySelectorAll('.editor-selection-ring').forEach((node) => {
            (node as HTMLElement).style.boxShadow = 'none';
            (node as HTMLElement).style.outline = 'none';
            (node as HTMLElement).style.borderColor = 'transparent';
          });
        },
      });
      const imgData = canvas.toDataURL('image/png');

      if (index > 0) {
        pdf.addPage([preset?.widthMm ?? 210, preset?.heightMm ?? 297], 'portrait');
      }

      pdf.addImage(
        imgData,
        'PNG',
        0,
        0,
        preset?.widthMm ?? 210,
        preset?.heightMm ?? 297,
        undefined,
        'FAST',
      );
    } catch (error) {
      console.error('[pdf] page capture failed', { index, error });
      throw error;
    } finally {
      restoreImages();
    }
  }

  if (onProgress) {
    onProgress(pages.length, pages.length);
  }
  pdf.save(`${sanitizedTitle}.pdf`);
};
