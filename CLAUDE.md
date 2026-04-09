# CLAUDE.md

## Project Overview
학술대회 참석자에게 **초록집(Abstract Book)을 ebook으로 제공**하는 서비스.
React 18 + TypeScript + Vite + Tailwind CSS v3 + Firebase + PWA.

---

## Design Context

### Users
학술대회 현장 참석자. 발표 전후 혹은 세션 중 **모바일 기기**로 초록집을 열람한다. 읽기 속도와 탐색 편의성이 최우선이며, 논문·발표 자료를 빠르게 찾고 집중해서 읽는 것이 핵심 과업이다.

### Brand Personality
**세련 · 절제 · 학술적** — 학회지나 고품질 저널처럼 권위 있지만 접근성 높은 느낌.

### Aesthetic Direction
| 항목 | 방향 |
|------|------|
| 컬러 팔레트 | 딥 네이비(`#1a2744`) 주색, 오프화이트(`#f8f7f4`) 배경, 차콜(`#1c1c1e`) 텍스트 |
| 보조색 | 옅은 네이비 틴트(`#e8edf5`), 골드 포인트(`#c9a84c`) for 강조 |
| 다크모드 | 지원 (시스템 설정 + 수동 토글) — 어두운 배경은 `#12172b` |
| 폰트 | NanumSquare 유지 — 제목 800 weight, 본문 400 |
| 여백 | 넉넉한 padding, 행간 1.7~1.8 |
| 반경 | 카드 `rounded-2xl`, 버튼 `rounded-xl` — 너무 둥글지 않게 |
| 그림자 | 절제된 `shadow-sm`/`shadow-md` — 과도한 그림자 금지 |

**피해야 할 것**: 알록달록 SaaS 대시보드 느낌, 파란색/보라색 그라디언트 남발, 과도한 호버 애니메이션.

### Design Principles
1. **콘텐츠 우선** — UI 크롬 최소화, 초록 텍스트가 화면의 주인공
2. **모바일 퍼스트** — 터치 타겟 44px 이상, 스크롤 흐름 중심 레이아웃
3. **학술적 권위** — 딥 네이비 팔레트와 절제된 타이포그래피로 신뢰감
4. **최소 마찰** — 콘텐츠까지 최소 탭 수, 단순한 탐색 구조
5. **인쇄물 감성** — 충분한 여백, 규칙적인 그리드, 산만한 장식 배제

### CSS Variables (index.css에서 팔레트 변경 시 이 변수 수정)
```css
--brand-primary: #1a2744;       /* 딥 네이비 */
--brand-primary-light: #e8edf5; /* 네이비 틴트 */
--brand-primary-hover: #243660; /* 호버 상태 */
--brand-secondary: #c9a84c;     /* 골드 포인트 */
--brand-secondary-light: #f5edda;
```
