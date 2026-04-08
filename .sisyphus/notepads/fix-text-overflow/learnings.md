# Learnings

## Architecture
- domPagination.ts: DOM 기반 이진탐색으로 텍스트를 zone에 맞게 분할
- PublishingEditorShell.tsx: 렌더링 담당, measurementRootRef로 측정
- richText.tsx: textRunsToHtml(측정용) vs renderRunsToReact(렌더링용)
- 폰트: Noto Serif KR 사용

## Root Causes (4)
1. 측정(textRunsToHtml → <strong>) vs 렌더링(renderRunsToReact → <span style>) 불일치
2. 안전 마진 없음 - availableHeight에 1px도 여유 없음
3. 폰트 로딩 레이스 - document.fonts.ready 대기 없음
4. normalizeCutPoint이 문장/문단 단위로 자르며 여백 과다

## Key Files
- src/lib/publishing/domPagination.ts (225 lines) - 측정/분할 로직
- src/lib/publishing/richText.tsx (156 lines) - 텍스트 변환 유틸
- src/components/publishing/PublishingEditorShell.tsx - 렌더링 + 측정 useEffect
