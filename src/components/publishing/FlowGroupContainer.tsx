import { useEffect, useMemo, useRef, useState } from 'react';
import { ContentZoneTemplate, PublicationPage, PublishingDocument, TextThread } from '@/types/publishing';
import { renderRunsToReact } from '@/lib/publishing/richText';

interface FlowGroupContainerProps {
  zonesInGroup: ContentZoneTemplate[];
  page: PublicationPage;
  document: PublishingDocument;
  showContentBounds?: boolean;
  className?: string;
  onOverflow?: (threadId: string, overflowText: string, overflowStartOffset: number) => void;
  maxChars?: number;
}

const findOverflowCutPoint = (container: HTMLElement, maxScrollTop: number): number => {
  const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let totalChars = 0;

  while (treeWalker.nextNode()) {
    const textNode = treeWalker.currentNode as Text;
    const containerRect = container.getBoundingClientRect();

    for (let i = 0; i < textNode.length; i++) {
      const range = document.createRange();
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) { totalChars++; continue; }

      const relativeTop = rect.top - containerRect.top;
      if (relativeTop > maxScrollTop) {
        return totalChars;
      }
      totalChars++;
    }
  }

  return totalChars;
};

export default function FlowGroupContainer({
  zonesInGroup,
  page,
  document,
  showContentBounds = false,
  className = '',
  onOverflow,
  maxChars,
}: FlowGroupContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflowHandled, setOverflowHandled] = useState(false);

  const { containerStyle, displayTexts } = useMemo(() => {
    if (!zonesInGroup.length) {
      return { containerStyle: {}, displayTexts: [] };
    }

    const sortedZones = [...zonesInGroup].sort((a, b) => (a.flowOrder || 0) - (b.flowOrder || 0));
    const primaryZone = sortedZones[0];
    const columnCount = zonesInGroup.length;

    const threadMap = new Map<string, TextThread>();

    zonesInGroup.forEach((zoneTemplate) => {
      const zoneInstance = page.zones.find((item) => item.zoneId === zoneTemplate.id) ?? {
        zoneId: zoneTemplate.id,
        blocks: [],
      };

      zoneInstance.blocks.forEach((block) => {
        if (block.type === 'text' && block.flow?.sourceThreadId) {
          const thread = document.threads.find((t) => t.id === block.flow.sourceThreadId);
          if (thread && !threadMap.has(thread.id)) {
            threadMap.set(thread.id, thread);
          }
        }
      });
    });

    const minX = Math.min(...zonesInGroup.map((z) => z.frame.x));
    const minY = Math.min(...zonesInGroup.map((z) => z.frame.y));
    const maxX = Math.max(...zonesInGroup.map((z) => z.frame.x + z.frame.width));
    const maxY = Math.max(...zonesInGroup.map((z) => z.frame.y + z.frame.height));

    const texts: { threadId: string; text: string; runs: any[] }[] = [];
    let charsRemaining = maxChars ?? Infinity;

    for (const thread of threadMap.values()) {
      const fullText = thread.canonicalText.map((r) => r.text).join('');
      if (charsRemaining <= 0) break;

      const displayText = fullText.slice(0, charsRemaining);
      texts.push({ threadId: thread.id, text: displayText, runs: thread.canonicalText });
      charsRemaining -= displayText.length;
    }

    const colGap = sortedZones.length > 1
      ? sortedZones[1].frame.x - sortedZones[0].frame.x - sortedZones[0].frame.width
      : 16;

    const containerStyle = {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
      columnCount,
      columnGap: `${colGap}px`,
      columnFill: 'auto' as const,
      paddingTop: primaryZone.constraints.padding.top,
      paddingRight: primaryZone.constraints.padding.right,
      paddingBottom: primaryZone.constraints.padding.bottom,
      paddingLeft: primaryZone.constraints.padding.left,
      fontFamily: primaryZone.style.fontFamily,
      fontSize: `${primaryZone.style.fontSize}px`,
      fontWeight: primaryZone.style.fontWeight,
      lineHeight: primaryZone.style.lineHeight,
      letterSpacing: `${primaryZone.style.letterSpacing}px`,
      color: primaryZone.style.color,
      textAlign: primaryZone.style.textAlign as React.CSSProperties['textAlign'],
    };

    return { containerStyle, displayTexts: texts };
  }, [zonesInGroup, page, document, maxChars]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onOverflow || overflowHandled) return;

    const check = () => {
      requestAnimationFrame(() => {
        if (!container) return;
        if (container.scrollHeight > container.clientHeight + 1) {
          const cutPoint = findOverflowCutPoint(container, container.clientHeight - 1);
          if (cutPoint > 0 && cutPoint < Infinity) {
            let charCount = 0;
            for (const dt of displayTexts) {
              if (charCount + dt.text.length > cutPoint) {
                const overflowOffset = cutPoint - charCount;
                const overflowText = dt.text.slice(overflowOffset);
                onOverflow(dt.threadId, overflowText, cutPoint);
                setOverflowHandled(true);
                return;
              }
              charCount += dt.text.length;
            }
          }
        }
      });
    };

    if (globalThis.document?.fonts?.ready) {
      globalThis.document.fonts.ready.then(check);
    } else {
      check();
    }
  }, [displayTexts, onOverflow, overflowHandled]);

  if (!zonesInGroup.length) {
    return null;
  }

  const flowGroupId = zonesInGroup[0]?.flowGroupId;

  return (
    <div
      ref={containerRef}
      key={`flowgroup-${flowGroupId}-${page.id}`}
      className={`absolute ${showContentBounds ? 'editor-guide border border-dashed border-blue-300' : ''} ${className}`}
      style={{
        ...containerStyle,
        overflow: 'hidden',
      }}
    >
      {displayTexts.map((dt) => (
        <div key={dt.threadId} style={{ breakInside: 'auto' }}>
          {renderRunsToReact(dt.runs)}
        </div>
      ))}
    </div>
  );
}
