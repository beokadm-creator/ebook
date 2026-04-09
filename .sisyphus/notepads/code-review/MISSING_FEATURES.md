# 미비되거나 단절된 기능 분석 보고서
**작성일:** 2026-04-10
**분석 범위:** 전체 코드베이스 미구현/미완성 기능

---

## 🔴 심각한 미구현 기능

### 1. 오프라인 동기화 기능 (완전 미구현)
**위험도:** 🔴 **높음**
**파일:** `src/components/offline/OfflineManager.tsx`
**라인:** 81-96

**문제점:**
```typescript
// TODO: 각 액션을 서버에 동기화
for (const action of actions) {
  await syncAction(action);
}

// TODO: 실제 동기화 로직 구현
const syncAction = async (action: any) => {
  // TODO: 실제 동기화 로직 구현
  void action;  // ❌ 아무것도 하지 않음!
};
```

**영향:**
- ✅ 오프라인 상태 감지 (구현됨)
- ✅ 오프라인 액션 저장 (구현됨)
- ❌ **온라인 복구 시 동기화 (미구현)**
- ❌ **충돌 해소 전략 (없음)**
- ❌ **동기화 실패 처리 (없음)**

**현재 동작:**
1. 오프라인 상태에서 변경사항이 `localStorage`에 저장됨
2. 온라인 복구 시 "동기화" 버튼 표시
3. 버튼 클릭 시 **아무일도 일어나지 않음** (데이터 손실)

**필요 구현:**
```typescript
const syncAction = async (action: SyncAction) => {
  switch (action.type) {
    case 'UPDATE_CONFERENCE':
      await updateDoc(doc(db, 'conferences', action.payload.id), action.payload);
      break;
    case 'CREATE_PUBLICATION':
      await addDoc(collection(db, 'publications'), action.payload);
      break;
    case 'UPDATE_PUBLICATION':
      await updateDoc(doc(db, 'publications', action.payload.id), action.payload);
      break;
    case 'DELETE_PUBLICATION':
      await deleteDoc(doc(db, 'publications', action.payload.id));
      break;
    default:
      console.warn('Unknown action type:', action.type);
  }
};
```

**우선순위:** 🔴 **즉시 수정 필요**
**예상 소요시간:** 2-3일

---

## 🟠 중간 우선순위 미구현 기능

### 2. 사용자 권한 관리 시스템
**위험도:** 🟠 **중간**
**파일:** `src/contexts/AuthContext.tsx`

**문제점:**
```typescript
// 첫 가입자 자동 관리자 부여 (보안 문제)
role: 'admin', // ❌ 안전하지 않음

// 권한 변경 기능 없음
// role: 'admin' → 'user' 변경 방법 없음
// 다른 사용자를 관리자로 승격하는 기능 없음
```

**미구현 기능:**
- ❌ 관리자 승격/강등 기능
- ❌ 사용자 목록 조회
- ❌ 권한 변경 UI
- ❌ 권한 변경 감사 로그

**필요 구현:**
```typescript
// Cloud Functions로 권한 관리
exports.setUserRole = functions.https.onCall(async (data, context) => {
  // 1. 요청자가 관리자인지 확인
  // 2. 대상 사용자의 role 변경
  // 3. Firebase Custom Claims 업데이트
  // 4. 변경 로그 기록
});
```

**우선순위:** 🟠 **높음**
**예상 소요시간:** 3-4일

---

### 3. 검색 기능 제한 사항
**위험도:** 🟡 **낮음**
**파일:** `src/lib/searchService.ts`

**문제점:**
```typescript
// 모든 문서를 클라이언트로 가져와서 검색 (비효율)
const confsSnap = await getDocs(collection(db, 'conferences'));
const pubsSnap = await getDocs(collection(db, 'publications'));
```

**현재 제한 사항:**
- ❌ **서버사이드 검색 없음** (클라이언트에서 전체 스캔)
- ❌ **페이징 없음** (모든 결과 한 번에 로드)
- ❌ **검색어 자동완성 없음**
- ❌ **검색 필터 없음** (날짜, 카테고리 등)
- ❌ **검색어 하이라이트 없음**
- ❌ **검색 히스토리 없음**

**성능 문제:**
- 데이터가 1000개 이상이면 느려질 수 있음
- 네트워크 전송량 많음
- 검색할 때마다 전체 데이터 다운로드

**필요 구현:**
```typescript
// Algolia 또는 Firebase Extensions 사용
// 또는 Cloud Functions에서 검색 처리
export async function searchContent(
  query: string,
  filters?: SearchFilters,
  pagination?: PaginationParams
): Promise<SearchResult[]> {
  // 서버사이드 검색 구현
}
```

**우선순위:** 🟡 **중간**
**예상 소요시간:** 2-3일

---

### 4. 에러 추적 및 로깅 시스템
**위험도:** 🟡 **낮음**
**파일:** 전역

**문제점:**
```typescript
// 대부분의 에러가 console.error로만 기록됨
catch (error) {
  console.error('Error:', error); // ❌ 프로덕션에서 사용 불가
}
```

**미구현 기능:**
- ❌ **중앙화된 에러 추적** (Sentry, Firebase Crashlytics)
- ❌ **에러 알림** (Slack, 이메일)
- ❌ **사용자별 에러 현황**
- ❌ **에러 통계 및 대시보드**
- ❌ **에러 복구 가이드**

**현재 상황:**
- `errorHandler.ts`에 에러 처리 로직이 있지만 실제로 연결되지 않음
- 프로덕션 환경에서 에러 발생 시 알 수 없음

**필요 구현:**
```typescript
import * as Sentry from '@sentry/react';

// 에러 추적 연결
Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});

// 모든 에러 처리기에서 사용
try {
  // ...
} catch (error) {
  logger.error('Operation failed', error);
  Sentry.captureException(error);
}
```

**우선순위:** 🟡 **중간**
**예상 소요시간:** 1-2일

---

### 5. PDF 다운로드 기능 제한 사항
**위험도:** 🟢 **낮음**
**파일:** `src/lib/publishing/pdf.ts`

**문제점:**
```typescript
// PDF 생성 기능은 있지만 검증 필요
export const downloadPagesAsPdf = async (...) => {
  // 복잡한 PDF 생성 로직
  // 테스트되지 않았을 가능성 높음
}
```

**미구현/검증 필요:**
- ❌ **한글 폰트 지원 검증**
- ❌ **대용량 PDF 생성 시 성능**
- ❌ **PDF 생성 실패 처리**
- ❌ **PDF 생성 진행률 표시**
- ❌ **PDF 품질 설정**

**우선순위:** 🟢 **낮음**
**예상 소요시간:** 1-2일 (검증)

---

## 🟡 기능적 제한 사항

### 6. 발표자(Presenter) 관리 기능
**파일:** `src/components/publishing/SpeakerContributionPanel.tsx`

**미구현 기능:**
- ❌ 발표자 정보 데이터베이스 저장
- ❌ 발표자 프로필 사진 관리
- ❌ 발표자 검색 및 필터링
- ❌ 발표자 순서 드래그앤드롭 (UI만 있음)
- ❌ 발표자 중복 체크

**현재 상황:**
- UI는 완성되어 있지만 데이터 연결이 불완전할 수 있음

**우선순위:** 🟡 **중간**
**예상 소요시간:** 2-3일

---

### 7. 읽기 진행률 동기화
**파일:** `src/hooks/useReadingProgress.ts`

**미구현 기능:**
- ❌ **다른 기기 간 진행률 동기화**
- ❌ **진행률 통계 및 분석**
- ❌ **북마크와 하이라이트 연동**
- ❌ **진행률 공유 기능**

**현재 상황:**
```typescript
// 로컬 스토리지에만 저장
const saveProgress = (currentIndex: number) => {
  localStorage.setItem(`reading_progress_${publicationId}`, JSON.stringify({
    currentIndex,
    timestamp: Date.now()
  }));
};
```

**필요 구현:**
```typescript
// Firestore에 진행률 저장
await setDoc(doc(db, 'users', userId, 'progress', publicationId), {
  currentIndex,
  timestamp: Date.now()
});
```

**우선순위:** 🟡 **중간**
**예상 소요시간:** 1-2일

---

### 8. 테마 및 개인화 설정
**파일:** `src/stores/viewerStore.ts`, `src/stores/personalizationStore.ts`

**미구현 기능:**
- ❌ **서버에 테마 설정 저장** (로컬만 저장)
- ❌ **기기 간 테마 동기화**
- ❌ **사용자별 테마 프리셋**
- ❌ **접근성 설정 (고대비, 글자크기 등)**

**현재 상황:**
```typescript
// 로컬 스토리지에만 저장됨
function syncToLocalStorage(state: ViewerSettings): void {
  saveLocalUserPreferences(state);
}
```

**우선순위:** 🟢 **낮음**
**예상 소요시간:** 1일

---

## 📊 통계

| 카테고리 | 개수 | 심각도 |
|----------|------|---------|
| 완전 미구현 기능 | 1 | 🔴 높음 |
| 부분 미구현 기능 | 7 | 🟠 중간 |
| 기능적 제한 사항 | 3 | 🟡 낮음 |
| **총계** | **11** | |

---

## 🎯 우선순위별 조치 계획

### 1단계: 긴급 수정 (이번 주)
1. **오프라인 동기화 구현** - 데이터 손실 방지
2. **사용자 권한 관리** - 보안 강화

### 2단계: 기능 개선 (다음 주)
1. **검색 기능 최적화** - 성능 개선
2. **에러 추적 시스템** - 프로덕션 모니터링

### 3단계: 사용자 경험 개선 (2-3주 후)
1. **진행률 동기화** - 멀티 기기 지원
2. **테마 설정 저장** - 개인화 개선

---

## 🚨 주의사항

### 데이터 손실 위험
- **오프라인 동기화 미구현**으로 인해 오프라인 중 변경사항이 손실될 수 있음
- 사용자 경험에 심각한 영향

### 보안 위험
- **자동 관리자 권한 부여**로 인해 권한 관리가 불가능
- 적절한 권한 관리 시스템 시급히 필요

### 성능 문제
- **클라이언트 사이드 검색**으로 인해 데이터 증가 시 성능 저하
- 서버사이드 검색 또는 검색 전용 솔루션 필요

---

## ✅ 잘 구현된 기능

- ✅ 발표자(Presenter) 편집 UI
- ✅ 마스터 페이지 텔릿 관리
- ✅ 리치 텍스트 에디터
- ✅ 페이지네이션 및 레이아웃
- ✅ PWA 오프라인 지원 (부분적)
- ✅ 테마 전환 (다크/라이트 모드)

---

**보고서 종료**
