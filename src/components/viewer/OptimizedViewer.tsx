import React, { useMemo, useCallback, useState, useRef } from 'react';
import { AutoSizer, CellMeasurer, CellMeasurerCache, List } from 'react-virtualized';
import ContentBlock from './ContentBlock';
import { useViewerStyles } from '@/stores/viewerStore';
import { ContentBlock as ContentType } from '@/types/content';

interface OptimizedViewerProps {
  contentBlocks: ContentType[];
  publicationId?: string;
  onFootnoteClick?: (footnoteId: string) => void;
  onScroll?: (scrollTop: number, clientHeight: number, scrollHeight: number) => void;
  initialScrollIndex?: number;
}

const OptimizedViewer: React.FC<OptimizedViewerProps> = ({
  contentBlocks,
  onFootnoteClick,
  onScroll,
  initialScrollIndex = 0
}) => {
  const { getTypographyStyles, getThemeClasses } = useViewerStyles();
  const themeClasses = getThemeClasses();
  const typographyStyles = getTypographyStyles();
  const listRef = useRef<List>(null);

  // CellMeasurerCache 설정 - 각 셀의 높이를 측정하여 성능 최적화
  const cache = useMemo(() =>
    new CellMeasurerCache({
      fixedWidth: true,
      defaultHeight: 100,
      keyMapper: (index: number) => contentBlocks[index]?.id || index
    }),
    [contentBlocks]
  );

  const [listKey, setListKey] = useState(0);

  // 설정 변경 시 리스트 재렌더링
  React.useEffect(() => {
    setListKey(prev => prev + 1);
    cache.clearAll();
  }, [typographyStyles, themeClasses, cache]);

  // 초기 스크롤 위치 설정
  React.useEffect(() => {
    if (listRef.current && initialScrollIndex > 0) {
      setTimeout(() => {
        listRef.current?.scrollToRow(initialScrollIndex);
      }, 100);
    }
  }, [initialScrollIndex, listKey]);

  // 스크롤 이벤트 핸들러
  const handleScroll = useCallback((params: { scrollTop: number; clientHeight: number; scrollHeight: number }) => {
    if (onScroll) {
      onScroll(params.scrollTop, params.clientHeight, params.scrollHeight);
    }
  }, [onScroll]);

  // rowRenderer - Virtualized List의 각 행 렌더링
  const rowRenderer = useCallback(({ 
    index, 
    key, 
    parent, 
    style 
  }: {
    index: number;
    key: string;
    parent: any;
    style: React.CSSProperties;
  }) => {
    const block = contentBlocks[index];

    return (
      <CellMeasurer
        cache={cache}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <div style={style} className="px-4 py-2">
          <ContentBlock 
            block={block} 
            onFootnoteClick={onFootnoteClick} 
          />
        </div>
      </CellMeasurer>
    );
  }, [contentBlocks, cache, onFootnoteClick]);

  if (!contentBlocks.length) {
    return (
      <div className={`flex items-center justify-center h-screen ${themeClasses.bg}`}>
        <p className={`text-lg ${themeClasses.text}`}>컨텐츠를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div 
      className={`h-screen ${themeClasses.bg}`}
      style={typographyStyles}
    >
      <AutoSizer>
        {({ width, height }: { width: number; height: number }) => (
          <List
            ref={listRef}
            key={listKey}
            width={width}
            height={height}
            rowCount={contentBlocks.length}
            rowHeight={cache.rowHeight}
            rowRenderer={rowRenderer}
            deferredMeasurementCache={cache}
            overscanRowCount={5}
            onScroll={handleScroll}
            className="scrollbar-hide"
            scrollTop={initialScrollIndex > 0 ? undefined : 0}
          />
        )}
      </AutoSizer>
    </div>
  );
};

export default React.memo(OptimizedViewer);