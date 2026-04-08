import { PublishingDocument } from '@/types/publishing';
import { PaginationSegmentPlacement } from '@/lib/publishing/pagination';
import { splitRunsByTexts, textRunsToHtml } from '@/lib/publishing/richText';

const normalizeCutPoint = (text: string, index: number) => {
  if (index >= text.length) {
    return text.length;
  }

  const paragraph = text.lastIndexOf('\n\n', index);
  if (paragraph > 0) {
    return paragraph + 2;
  }

  const sentence = Math.max(text.lastIndexOf('. ', index), text.lastIndexOf('! ', index), text.lastIndexOf('? ', index));
  if (sentence > 0) {
    return sentence + 2;
  }

  const word = text.lastIndexOf(' ', index);
  if (word > 0) {
    return word + 1;
  }

  return index;
};

const findZoneForThread = (document: PublishingDocument, threadId: string) => {
  const thread = document.threads.find((item) => item.id === threadId);
  if (!thread) {
    return null;
  }

  const sourcePage = document.pages.find((page) => page.id === thread.sourcePageId);
  const master = sourcePage
    ? document.masters.items.find((item) => item.id === sourcePage.masterId)
    : null;
  const zone = master?.contentZones.find((item) => item.id === thread.sourceZoneId);

  return thread && zone && master ? { thread, zone, master } : null;
};

const createMeasurementNode = (root: HTMLElement, width: number, style: CSSStyleDeclaration | Record<string, string>) => {
  const node = document.createElement('div');
  node.style.position = 'absolute';
  node.style.visibility = 'hidden';
  node.style.pointerEvents = 'none';
  node.style.left = '-99999px';
  node.style.top = '0';
  node.style.width = `${width}px`;
  node.style.whiteSpace = 'pre-wrap';
  node.style.wordBreak = 'break-word';
  node.style.overflowWrap = 'anywhere';

  Object.entries(style).forEach(([key, value]) => {
    if (value) {
      node.style.setProperty(key, value);
    }
  });

  root.appendChild(node);
  return node;
};

export const paginateThreadWithDom = (
  documentState: PublishingDocument,
  threadId: string,
  measurementRoot: HTMLElement,
) => {
  const resolved = findZoneForThread(documentState, threadId);
  if (!resolved) {
    return [];
  }

  const { thread, zone, master } = resolved;
  const flowZones = zone.flowGroupId
    ? master.contentZones
        .filter((item) => item.flowGroupId === zone.flowGroupId && item.allowThreadContinuation !== false)
        .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))
    : [zone];

  const node = createMeasurementNode(measurementRoot, 10, {});

  const sourceText = thread.canonicalText.map((run) => run.text).join('');
  const segments: PaginationSegmentPlacement[] = [];
  let remaining = sourceText;

  const measureHeight = (text: string, activeZone = zone) => {
    const typography = {
      ...activeZone.style,
      ...(thread.styleOverride ?? {}),
    };
    const availableWidth =
      activeZone.frame.width - activeZone.constraints.padding.left - activeZone.constraints.padding.right;
    node.style.width = `${availableWidth}px`;
    node.style.fontFamily = typography.fontFamily;
    node.style.fontSize = `${typography.fontSize}px`;
    node.style.fontWeight = `${typography.fontWeight}`;
    node.style.lineHeight = `${typography.lineHeight}`;
    node.style.letterSpacing = `${typography.letterSpacing}px`;
    node.style.color = typography.color;
    node.style.textAlign = typography.textAlign;
    const [segmentRuns] = splitRunsByTexts(thread.canonicalText, [text]);
    node.innerHTML = textRunsToHtml(segmentRuns ?? [{ text }]);
    return node.getBoundingClientRect().height;
  };

  let zonePointer = 0;

  while (remaining.length > 0 || segments.length === 0) {
    const activeZone = flowZones[zonePointer % flowZones.length];
    const availableHeight =
      activeZone.frame.height - activeZone.constraints.padding.top - activeZone.constraints.padding.bottom;

    if (measureHeight(remaining, activeZone) <= availableHeight) {
      segments.push({
        zoneId: activeZone.id,
        text: remaining,
      });
      break;
    }

    let low = 0;
    let high = remaining.length;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = remaining.slice(0, mid);

      if (measureHeight(candidate, activeZone) <= availableHeight) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const cut = normalizeCutPoint(remaining, best);
    segments.push({
      zoneId: activeZone.id,
      text: remaining.slice(0, cut).trimEnd(),
    });
    remaining = remaining.slice(cut).trimStart();
    zonePointer += 1;
  }

  measurementRoot.removeChild(node);
  return segments;
};
