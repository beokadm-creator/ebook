import { PagePreset } from '@/types/publishing';

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
        return;
      }
    }),
  );
};

export const downloadPagesAsPdf = async (
  pages: HTMLElement[],
  title: string,
  preset?: PagePreset,
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
  }

  pdf.save(`${sanitizedTitle}.pdf`);
};
