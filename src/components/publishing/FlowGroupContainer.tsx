import { useMemo } from 'react';
import { ContentZoneTemplate, PublicationPage, PublishingDocument, TextRun, TextThread } from '@/types/publishing';
import { renderRunsToReact } from '@/lib/publishing/richText';

const getFlowGroupZIndex = (zone?: ContentZoneTemplate) => {
  if (!zone) {
    return 1;
  }

  if (zone.slotKey === 'track') {
    return 30;
  }

  if (zone.slotKey?.startsWith('title')) {
    return 20;
  }

  if (zone.slotKey?.startsWith('authors') || zone.slotKey?.startsWith('affiliation')) {
    return 15;
  }

  return 1;
};

const shouldAllowVisibleOverflow = (zone?: ContentZoneTemplate) => zone?.slotKey === 'track';

interface FlowGroupContainerProps {
  zonesInGroup: ContentZoneTemplate[];
  page: PublicationPage;
  document: PublishingDocument;
  showContentBounds?: boolean;
  className?: string;
}

export default function FlowGroupContainer({
  zonesInGroup,
  page,
  document,
  showContentBounds = false,
  className = '',
}: FlowGroupContainerProps) {
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

    const texts: { threadId: string; text: string; runs: TextRun[] }[] = [];
    for (const thread of threadMap.values()) {
      const fullText = thread.canonicalText.map((r) => r.text).join('');
      texts.push({ threadId: thread.id, text: fullText, runs: thread.canonicalText });
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
      textAlignLast: primaryZone.style.textAlign === 'justify' ? 'left' as const : undefined,
      textJustify: primaryZone.style.textAlign === 'justify' ? 'inter-character' as const : undefined,
      textRendering: 'optimizeLegibility' as const,
      fontKerning: 'normal' as const,
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
      overflowWrap: 'anywhere' as const,
      hyphens: 'auto' as const,
    };

    return { containerStyle, displayTexts: texts };
  }, [zonesInGroup, page, document]);

  if (!zonesInGroup.length) {
    return null;
  }

  const flowGroupId = zonesInGroup[0]?.flowGroupId;

  return (
    <div
      key={`flowgroup-${flowGroupId}-${page.id}`}
      className={`absolute ${showContentBounds ? 'editor-guide border border-dashed border-blue-300' : ''} ${className}`}
      style={{
        ...containerStyle,
        overflow: shouldAllowVisibleOverflow(zonesInGroup[0]) ? 'visible' : 'hidden',
        zIndex: getFlowGroupZIndex(zonesInGroup[0]),
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
