# Firebase 설정 및 시드 데이터 생성 가이드

## 1. Firebase 프로젝트 설정

### Firebase Console 설정
1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 새 프로젝트 생성
3. 프로젝트 설정 → 일반 → 웹 앱 추가
4. Firebase SDK snippet 복사

### .env 파일 생성
```bash
# .env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 2. Firebase Emulator 설정 (로컬 개발용)

### firebase.json 생성
```json
{
  "firestore": {
    "rules": "firebase/firestore.rules",
    "indexes": "firebase/firestore.indexes.json"
  },
  "storage": {
    "rules": "firebase/storage.rules"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

### Emulator 설치 및 실행
```bash
# Firebase CLI 설치
npm install -g firebase-tools

# 로그인
firebase login

# Emulator 시작
firebase emulators:start

# 또는 백그라운드 실행
firebase emulators:start --only firestore,storage,auth
```

---

## 3. 시드 데이터 생성 스크립트

### 시드 데이터 파일 생성
```bash
# seed-data.ts 파일 생성
# 아래 코드를 참고하여 생성
```

### 시드 데이터 실행
```bash
# Emulator가 실행 중인 상태에서
npm run seed
```

---

## 4. Firestore 보안 규칙 배포

### 로컬 Emulator에 규칙 적용
```bash
# Emulator 실행 상태에서
firebase emulators:start --only firestore
```

### 프로덕션에 규칙 배포
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

---

## 5. Cloud Functions 배포

### 로컬에서 테스트
```bash
# Emulator와 함께 Functions 실행
firebase emulators:start
```

### 프로덕션에 배포
```bash
firebase deploy --only functions
```

---

## 6. 데이터베이스 초기화 순서

### 1단계: Firebase 프로젝트 설정
```bash
firebase init
```

### 2단계: Emulator 실행
```bash
firebase emulators:start
```

### 3단계: 시드 데이터 생성
```bash
npm run seed
```

### 4단계: UI 연결 테스트
```bash
npm run dev
```

---

## 7. 데이터 확인 방법

### Emulator UI
- URL: http://localhost:4000
- Firestore 탭에서 데이터 확인

### Firebase Console (프로덕션)
- Firestore Database 탭
- 컬렉션별 데이터 확인

---

## 8. 문제 해결

### Emulator 포트 충돌
```bash
# 사용 중인 포트 확인
netstat -ano | findstr :8080

# 포트 변경 (firebase.json)
"emulators": {
  "firestore": { "port": 8081 }
}
```

### 시드 데이터 실패
- Emulator가 실행 중인지 확인
- Firebase 연결 설정 확인
- Firestore 규칙 확인

---

## 9. 다음 단계

1. ✅ Firebase 프로젝트 생성
2. ✅ .env 파일 설정
3. ✅ Emulator 설치 및 실행
4. ✅ 시드 데이터 생성
5. ⏳ Admin UI와 Firestore 연동
6. ⏳ CRUD 기능 테스트
7. ⏳ Cloud Functions 배포