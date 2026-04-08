import { ContentZoneTemplate, PublishingDocument } from '@/types/publishing';
import { PaginationSegmentPlacement } from '@/lib/publishing/pagination';
import { splitRunsByTexts, runsToMeasurementHtml } from '@/lib/publishing/richText';

const FLOW_ROW_THRESHOLD_PX = 24;
const SAFE_MARGIN_PX = 1;

const sortFlowZonesForReadingOrder = <T extends { frame: { x: number; y: number } }>(zones: T[]) =>
  [...zones].sort((left, right) => {
    if (Math.abs(left.frame.y - right.frame.y) > FLOW_ROW_THRESHOLD_PX) {
      return left.frame.y - right.frame.y;
    }
    return left.frame.x - right.frame.x;
  });

const normalizeGroupZones = (zones: ContentZoneTemplate[]) => {
  if (zones.length <= 1) {
    return zones;
  }

  const reference = sortFlowZonesForReadingOrder(zones)[0];
  return zones.map((zone) => ({
    ...zone,
    style: { ...reference.style },
    constraints: JSON.parse(JSON.stringify(reference.constraints)) as ContentZoneTemplate['constraints'],
  }));
};

const isColumnFlowGroup = (zones: Array<{ frame: { y: number; height: number } }>) => {
  if (zones.length <= 1) {
    return false;
  }

  const reference = zones[0];
  return zones.every(
    (zone) =>
      Math.abs(zone.frame.y - reference.frame.y) <= 2
      && Math.abs(zone.frame.height - reference.frame.height) <= 2,
  );
};

const isCJK = (text: string) => /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(text.slice(0, 200));

const estimateCharsPerLine = (zoneWidth: number, fontSize: number) => {
  return Math.floor(zoneWidth / (fontSize * 0.55));
};

const normalizeCutPoint = (text: string, index: number, charsPerLine = 40) => {
  if (index >= text.length) {
    return text.length;
  }

  // 문단 경계 — 매우 가까우면(절반 줄 이내) 따라감
  const paragraph = text.lastIndexOf('\n\n', index);
  if (paragraph > 0 && index - paragraph <= charsPerLine / 2) {
    return paragraph + 2;
  }

  const cjk = isCJK(text);
  const searchWindow = cjk ? Math.max(0, index - Math.floor(charsPerLine * 0.6)) : Math.max(0, index - charsPerLine);

  // 문장 경계 (영문)
  if (!cjk) {
    const sentence = Math.max(
      text.lastIndexOf('. ', index),
      text.lastIndexOf('! ', index),
      text.lastIndexOf('? ', index),
      text.lastIndexOf('.\n', index),
      text.lastIndexOf('!\n', index),
      text.lastIndexOf('?\n', index),
    );
    if (sentence >= searchWindow) {
      return sentence + 2;
    }
  }

  // 개행
  const newline = text.lastIndexOf('\n', index);
  if (newline >= searchWindow) {
    return newline + 1;
  }

  // 공백/단어 경계
  const word = text.lastIndexOf(' ', index);
  if (word >= searchWindow) {
    return word + 1;
  }

  // CJK: 공백이 없으면 그냥 best 사용
  if (cjk) {
    return index;
  }

  return index;
};

const resolveCutPoint = (text: string, bestIndex: number, charsPerLine = 40) => {
  const normalized = normalizeCutPoint(text, bestIndex, charsPerLine);
  if (normalized <= 0) {
    return bestIndex;
  }

  const lostChars = bestIndex - normalized;
  // 한 줄 이상 손실되면 자르지 않음
  const maxAllowedLoss = Math.max(charsPerLine * 1.2, 10);
  if (lostChars > maxAllowedLoss || normalized < bestIndex * 0.88) {
    return bestIndex;
  }

  return normalized;
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
  node.style.display = 'block';
  node.style.boxSizing = 'border-box';
  node.style.whiteSpace = 'pre-wrap';
  node.style.wordBreak = 'break-word';
  node.style.overflowWrap = 'anywhere';
  node.style.hyphens = 'auto';

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
  const groupedFlowZones = zone.flowGroupId
    ? normalizeGroupZones(
        sortFlowZonesForReadingOrder(
          master.contentZones.filter((item) => item.flowGroupId === zone.flowGroupId && item.allowThreadContinuation !== false && item.frame),
        ),
      )
    : [];
  const sourceIndex = groupedFlowZones.findIndex((item) => item.id === zone.id);
  const startsFromFirstZone = isColumnFlowGroup(groupedFlowZones);
  const currentPageZones = groupedFlowZones.length
    ? startsFromFirstZone || sourceIndex <= 0
      ? groupedFlowZones
      : groupedFlowZones.slice(sourceIndex)
    : [zone].filter((item) => item?.frame);
  const overflowPageZones = groupedFlowZones.length ? groupedFlowZones : [zone].filter((item) => item?.frame);

  if (!currentPageZones.length) {
    return [];
  }

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
    node.innerHTML = runsToMeasurementHtml(segmentRuns ?? [{ text }]);
    return node.getBoundingClientRect().height;
  };

  let pageOffset = 0;
  let zonePointer = 0;

  while (remaining.length > 0 || segments.length === 0) {
    const activeZones = pageOffset === 0 ? currentPageZones : overflowPageZones;
    const activeZone = activeZones[zonePointer];
    if (!activeZone?.frame) {
      break;
    }
    const availableHeight =
      activeZone.frame.height
      - activeZone.constraints.padding.top
      - activeZone.constraints.padding.bottom
      - SAFE_MARGIN_PX;

    if (measureHeight(remaining, activeZone) <= availableHeight) {
      segments.push({
        zoneId: activeZone.id,
        text: remaining,
        pageOffset,
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

    const zoneAvailableWidth = activeZone.frame.width - activeZone.constraints.padding.left - activeZone.constraints.padding.right;
    const typography = { ...activeZone.style, ...(thread.styleOverride ?? {}) };
    const cpl = estimateCharsPerLine(zoneAvailableWidth, typography.fontSize);
    const cut = resolveCutPoint(remaining, best, cpl);
    segments.push({
      zoneId: activeZone.id,
      text: remaining.slice(0, cut),
      pageOffset,
    });
    remaining = remaining.slice(cut);
    zonePointer += 1;
    if (remaining.length && zonePointer >= activeZones.length) {
      pageOffset += 1;
      zonePointer = 0;
    }
  }

  measurementRoot.removeChild(node);
  return segments;
};
