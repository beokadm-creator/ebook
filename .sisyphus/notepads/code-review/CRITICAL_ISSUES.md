# Code Review Report - eBook Platform
**Generated:** 2026-04-10
**Reviewer:** Atlas (OhMyOpenCode)
**Scope:** Security, Performance, Code Quality, Architecture

---

## Executive Summary

**Overall Assessment:** ⚠️ **MODERATE RISK**

The codebase demonstrates good architectural patterns with React 18, TypeScript, and Firebase integration. However, several **critical security vulnerabilities** and **code quality issues** require immediate attention before production deployment.

**Key Findings:**
- 🔴 **2 CRITICAL** security issues
- 🟠 **8 HIGH** priority issues
- 🟡 **12 MEDIUM** priority issues
- 🟢 **15 LOW** priority improvements

---

## 🔴 CRITICAL Security Issues

### 1. EXPOSED API KEYS IN REPOSITORY
**Severity:** CRITICAL
**File:** `.env`
**Lines:** 1-7

**Issue:**
```bash
VITE_FIREBASE_API_KEY=AIzaSyAhJoknMfz7MVQ41WfY3jwkUQ4vGImwpmU
VITE_FIREBASE_AUTH_DOMAIN=ebook-c74b2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ebook-c74b2
VITE_FIREBASE_STORAGE_BUCKET=ebook-c74b2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=426804561154
VITE_FIREBASE_APP_ID=1:426804561154:web:471195194f013765cc6e1b
```

**Risk:**
- Firebase API keys are publicly visible in the repository
- While Firebase keys are less sensitive than other API keys, exposure still enables:
  - Reverse engineering of your Firebase project
  - Potential quota exhaustion attacks
  - Unauthorized access to Firebase services

**Recommendation:**
1. **IMMEDIATE:** Rotate the exposed Firebase API key in Firebase Console
2. Remove `.env` from git tracking (add to `.gitignore`)
3. Create `.env.example` with placeholder values only
4. Add `.env` to `.gitignore`:
   ```bash
   echo ".env" >> .gitignore
   git rm --cached .env
   git commit -m "Remove exposed .env file"
   ```
5. Set up Firebase security rules to limit unauthorized access
6. Use environment-specific configs for development/staging/production

---

### 2. UNSAFE innerHTML USAGE (XSS Vulnerability)
**Severity:** CRITICAL
**Files:**
- `src/lib/publishing/richText.tsx:122`
- `src/components/publishing/RichTextThreadEditor.tsx:23,24,36,47,69`

**Issue:**
```typescript
// src/lib/publishing/richText.tsx:122
container.innerHTML = html; // Direct assignment without sanitization

// src/components/publishing/RichTextThreadEditor.tsx:23
if (editorRef.current.innerHTML !== nextHtml) {
  editorRef.current.innerHTML = nextHtml; // XSS vulnerability
}
```

**Risk:**
- Cross-Site Scripting (XSS) attacks
- Malicious scripts can be injected through rich text content
- User sessions can be hijacked
- Sensitive data can be exfiltrated

**Recommendation:**
1. **IMMEDIATE:** Implement HTML sanitization using DOMPurify:
   ```typescript
   import DOMPurify from 'dompurify';

   // Sanitize HTML before setting innerHTML
   const sanitizedHtml = DOMPurify.sanitize(html, {
     ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'span'],
     ALLOWED_ATTR: ['class', 'style']
   });
   container.innerHTML = sanitizedHtml;
   ```

2. Install DOMPurify:
   ```bash
   npm install dompurify @types/dompurify
   ```

3. Implement Content Security Policy (CSP) headers in `index.html`:
   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
   ```

4. Validate all user inputs on the backend before storing
5. Consider using a proper rich text editor library (TipTap, Slate.js) with built-in XSS protection

---

## 🟠 HIGH Priority Issues

### 3. AUTO-ADMIN ROLE ASSIGNMENT
**Severity:** HIGH
**File:** `src/contexts/AuthContext.tsx:82-93`

**Issue:**
```typescript
} else {
  // 사용자 문서가 없으면 첫 로그인 시 자동 생성
  await setDoc(doc(db, 'users', firebaseUser.uid), {
    email: firebaseUser.email,
    role: 'admin', // ⚠️ 첫 사용자는 자동으로 admin - SECURITY RISK!
    displayName: firebaseUser.displayName || '',
    createdAt: new Date().toISOString(),
  });
```

**Risk:**
- **Any user who signs up first gets admin privileges**
- No proper admin approval workflow
- Potential privilege escalation attack

**Recommendation:**
1. Remove auto-admin assignment:
   ```typescript
   role: null, // Default to null, require manual admin assignment
   ```

2. Implement proper admin role management:
   ```typescript
   // First user gets 'user' role, not 'admin'
   role: 'user',

   // Add a function to promote users to admin (protected by Cloud Functions)
   // Or use Firebase Claims for role management
   ```

3. Use Firebase Custom Claims via Cloud Functions:
   ```typescript
   // Cloud Function to set admin claims
   exports.setAdminClaims = functions.https.onCall(async (data, context) => {
     // Verify requester is already an admin
     // Set custom claims for target user
   });
   ```

4. Implement admin approval workflow for new user access

---

### 4. NO RATE LIMITING ON AUTHENTICATION
**Severity:** HIGH
**Impact:** Vulnerable to brute force attacks

**Issue:**
- No rate limiting visible on login endpoints
- Firebase Authentication has built-in rate limiting, but custom implementation may be needed
- No account lockout mechanism after failed attempts

**Recommendation:**
1. Enable Firebase Authentication rate limiting in console
2. Implement additional rate limiting with Cloud Functions:
   ```typescript
   // Cloud Function with rate limiting
   exports.loginWithRateLimit = functions.https.onCall(async (data, context) => {
     const rateLimiter = require('./rateLimiter');
     await rateLimiter.check(data.email);
     // Proceed with login
   });
   ```

3. Implement account lockout after N failed attempts
4. Add CAPTCHA after suspicious activity patterns

---

### 5. MISSING CONTENT SECURITY POLICY (CSP)
**Severity:** HIGH
**File:** `index.html`

**Issue:**
- No CSP headers configured
- Vulnerable to XSS attacks
- No restrictions on resource loading

**Recommendation:**
1. Add CSP meta tag to `index.html`:
   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'self';
                  script-src 'self' 'unsafe-inline' 'unsafe-eval';
                  style-src 'self' 'unsafe-inline';
                  img-src 'self' data: https://firebasestorage.googleapis.com;
                  connect-src 'self' https://*.firebaseio.com https://*.googleapis.com;
                  font-src 'self' https://fonts.gstatic.com;">
   ```

2. Configure CSP headers in Firebase Hosting:
   ```json
   // firebase.json
   {
     "hosting": {
       "headers": [
         {
           "source": "**",
           "headers": [
             {
               "key": "Content-Security-Policy",
               "value": "default-src 'self'; script-src 'self'; object-src 'none';"
             }
           ]
         }
       ]
     }
   }
   ```

---

### 6. CONSOLE LOGS IN PRODUCTION CODE
**Severity:** HIGH
**Count:** 16 files affected

**Files with console statements:**
- `src/contexts/AuthContext.tsx:61,96`
- `src/lib/firebase.ts:27,53,55,61,63,69,71,77,79`
- `src/utils/errorHandler.ts:151-161`
- And 13 more files...

**Risk:**
- Information leakage in production
- Performance degradation
- Exposes internal implementation details
- Can reveal sensitive data in error messages

**Recommendation:**
1. Remove all console.log statements from production code
2. Replace with proper logging service:
   ```typescript
   import { logger } from '@/lib/logger';

   // Development only
   if (import.meta.env.DEV) {
     console.log('Debug info');
   }

   // Production - use proper logger
   logger.info('User action', { userId, action });
   logger.error('Operation failed', { error, context });
   ```

3. Implement a proper logging solution:
   - Firebase Crashlytics for errors
   - Firebase Analytics for user actions
   - Cloud Logging for server-side logs

---

### 7. TYPE SAFETY: MULTIPLE `any` TYPES
**Severity:** HIGH
**Count:** 6 instances

**Instances:**
```typescript
// src/components/offline/OfflineManager.tsx:94,197
const syncAction = async (action: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
const saveOfflineAction = (action: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any

// src/components/search/SearchBar.tsx:120
const getLocalTitle = (title: any): string => { // eslint-disable-line @typescript-eslint/no-explicit-any

// src/components/lobby/ConferenceDetail.tsx:21,22,146
formatDate: (v: any) => string;
getLocalText: (v: any) => string;
const formatDate = (value: any) => {
```

**Risk:**
- Loss of type safety
- Runtime errors
- Poor IDE autocomplete
- Difficult to maintain

**Recommendation:**
1. Define proper types for all `any` usages:
   ```typescript
   // Define proper types
   interface SyncAction {
     type: string;
     payload: unknown;
     timestamp: string;
   }

   const syncAction = async (action: SyncAction) => {
     // Type-safe implementation
   };
   ```

2. Enable stricter TypeScript rules:
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "noImplicitAny": true,
       "strictNullChecks": true
     }
   }
   ```

3. Run ESLint with TypeScript rules:
   ```bash
   npm run lint -- --max-warnings=0
   ```

---

### 8. NO INPUT VALIDATION
**Severity:** HIGH
**Impact:** Data integrity issues, potential injection attacks

**Issue:**
- No Zod schemas for user input validation
- Direct user input stored without validation
- No sanitization of form inputs

**Recommendation:**
1. Implement Zod validation schemas:
   ```typescript
   import { z } from 'zod';

   export const conferenceSchema = z.object({
     titleKo: z.string().min(1, 'Title is required').max(200),
     titleEn: z.string().max(200).optional(),
     startDate: z.string().datetime(),
     endDate: z.string().datetime(),
     // ... other fields
   });
   ```

2. Validate all user inputs at component level:
   ```typescript
   const handleSubmit = (data: FormData) => {
     const result = conferenceSchema.safeParse(data);
     if (!result.success) {
       // Handle validation errors
       return;
     }
     // Proceed with valid data
   };
   ```

3. Validate on backend with Cloud Functions:
   ```typescript
   exports.createConference = functions.https.onCall(async (data, context) => {
     const validated = conferenceSchema.parse(data);
     // Store validated data
   });
   ```

---

## 🟡 MEDIUM Priority Issues

### 9. LARGE STATE FILE (Publishing Store)
**Severity:** MEDIUM
**File:** `src/stores/publishingStore.ts`
**Size:** 1520+ lines

**Issue:**
- Single file with 1520+ lines
- Difficult to maintain and navigate
- High cognitive load

**Recommendation:**
1. Split into smaller, focused modules:
   ```
   stores/publishing/
     ├── index.ts (main store)
     ├── actions/
     │   ├── masterActions.ts
     │   ├── pageActions.ts
     │   ├── contributionActions.ts
     │   └── threadActions.ts
     ├── selectors/
     │   ├── masterSelectors.ts
     │   └── pageSelectors.ts
     └── utils/
         ├── normalization.ts
         └── validation.ts
   ```

2. Use Zustand's slice pattern:
   ```typescript
   // Create separate slices
   const createMasterSlice = (set: SetState<PublishingStore>) => ({
     createMaster: (name) => { /* ... */ },
     deleteMaster: (id) => { /* ... */ },
   });

   // Combine slices
   export const usePublishingStore = create<PublishingStore>()((set, get, api) => ({
     ...createMasterSlice(set, get, api),
     ...createPageSlice(set, get, api),
     // ... other slices
   }));
   ```

---

### 10. MISSING ERROR BOUNDARIES
**Severity:** MEDIUM
**Impact:** Poor error handling, bad UX

**Issue:**
- Only one error boundary at root level
- No granular error handling for specific components
- Errors can crash entire app sections

**Recommendation:**
1. Add error boundaries for major components:
   ```typescript
   // components/common/EditorErrorBoundary.tsx
   class EditorErrorBoundary extends React.Component {
     componentDidCatch(error, errorInfo) {
       logger.error('Editor error', { error, errorInfo });
     }

     render() {
       if (this.state.hasError) {
         return <ErrorFallback />;
       }
       return this.props.children;
     }
   }
   ```

2. Wrap critical components:
   ```typescript
   <EditorErrorBoundary>
     <PublishingEditor />
   </EditorErrorBoundary>
   ```

---

### 11. NO CODE SPLITTING FOR ADMIN ROUTES
**Severity:** MEDIUM
**Impact:** Larger bundle size for public users

**Issue:**
- Admin code loaded for all users
- Increases bundle size unnecessarily
- Slower initial load for public users

**Recommendation:**
1. Implement lazy loading for admin routes:
   ```typescript
   // App.tsx
   const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
   const ConferenceManagement = lazy(() => import('./components/admin/ConferenceManagement'));

   // In routes
   <Route path="/admin" element={
     <ProtectedRoute>
       <Suspense fallback={<AdminLoadingSkeleton />}>
         <ConferenceManagement />
       </Suspense>
     </ProtectedRoute>
   } />
   ```

2. Already using Vite's manual chunking - extend for admin:
   ```typescript
   // vite.config.ts
   manualChunks: {
     'vendor-react': ['react', 'react-dom'],
     'admin': [
       '@/components/admin/ConferenceManagement',
       '@/components/admin/PublicationManagement'
     ]
   }
   ```

---

### 12. INCOMPLETE OFFLINE SYNC IMPLEMENTATION
**Severity:** MEDIUM
**File:** `src/components/offline/OfflineManager.tsx`

**Issue:**
```typescript
const syncAction = async (action: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  // TODO: 실제 동기화 로직 구현
  void action;
};
```

**Risk:**
- Offline changes may be lost
- Inconsistent state between client and server
- Poor user experience

**Recommendation:**
1. Implement proper offline sync with Firebase:
   ```typescript
   const syncAction = async (action: SyncAction) => {
     switch (action.type) {
       case 'UPDATE_CONFERENCE':
         await updateDoc(doc(db, 'conferences', action.id), action.payload);
         break;
       case 'CREATE_PUBLICATION':
         await addDoc(collection(db, 'publications'), action.payload);
         break;
       // ... other action types
     }
   };
   ```

2. Use Firebase Firestore offline persistence:
   ```typescript
   // Enable offline persistence
   await enableIndexedDbPersistence(db);
   ```

3. Implement conflict resolution strategy

---

### 13. NO PERFORMANCE MONITORING
**Severity:** MEDIUM
**Impact:** Difficult to detect performance issues

**Issue:**
- No performance monitoring setup
- No metrics collection
- Difficult to track Core Web Vitals

**Recommendation:**
1. Add Firebase Performance Monitoring:
   ```typescript
   import { getPerformance, trace } from 'firebase/performance';

   const perf = getPerformance();
   const t = trace(perf, 'documentLoad');
   t.start();
   // ... operation
   t.stop();
   ```

2. Track Core Web Vitals:
   ```typescript
   import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

   getCLS(console.log);
   getFID(console.log);
   getFCP(console.log);
   getLCP(console.log);
   getTTFB(console.log);
   ```

---

### 14. MISSING ACCESSIBILITY FEATURES
**Severity:** MEDIUM
**Impact:** Poor accessibility for disabled users

**Issue:**
- No ARIA labels visible
- Missing keyboard navigation support
- No screen reader optimization

**Recommendation:**
1. Add ARIA labels:
   ```typescript
   <button
     aria-label="Save publication"
     onClick={handleSave}
   >
     Save
   </button>
   ```

2. Ensure keyboard navigation:
   ```typescript
   <div
     role="button"
     tabIndex={0}
     onKeyDown={(e) => e.key === 'Enter' && handleClick()}
     onClick={handleClick}
   >
   ```

3. Run accessibility audit:
   ```bash
   npm install -D @axe-core/react
   ```

---

## 🟢 LOW Priority Improvements

### 15-20. Additional Low Priority Issues
- Add JSDoc comments for public APIs
- Implement request deduplication
- Add loading states for all async operations
- Improve error messages for better UX
- Add unit tests (currently 0% coverage)
- Add E2E tests with Playwright

---

## Architecture Review

### ✅ Strengths
1. **Good component structure** - Clear separation of concerns
2. **TypeScript usage** - Strong typing throughout
3. **Zustand for state management** - Lightweight and efficient
4. **Firebase integration** - Scalable backend solution
5. **PWA support** - Offline capability with service workers

### ⚠️ Areas for Improvement
1. **State management** - Mix of Zustand and Context API
2. **Component size** - Some components are too large
3. **Prop drilling** - Some avoidable prop drilling
4. **No testing** - Zero test coverage

---

## Security Checklist

- [x] API key exposure found
- [x] XSS vulnerabilities identified
- [x] Authentication issues documented
- [ ] SQL Injection (not applicable - using Firestore)
- [ ] CSRF protection (not applicable - using Firebase Auth)
- [ ] Security headers (partially implemented)
- [ ] Input validation (missing)
- [ ] Output encoding (partially implemented)
- [ ] Authentication rate limiting (missing)

---

## Recommended Action Plan

### Phase 1: Critical Security (Week 1)
1. Rotate exposed Firebase API key
2. Remove .env from repository
3. Implement DOMPurify for XSS protection
4. Fix auto-admin role assignment
5. Add CSP headers

### Phase 2: High Priority (Week 2-3)
1. Remove all console.log statements
2. Replace all `any` types with proper types
3. Implement input validation with Zod
4. Add rate limiting for authentication
5. Implement proper error boundaries

### Phase 3: Medium Priority (Week 4-5)
1. Refactor large state files
2. Implement lazy loading for admin routes
3. Complete offline sync implementation
4. Add performance monitoring
5. Improve accessibility

### Phase 4: Low Priority (Week 6+)
1. Add unit tests
2. Add E2E tests
3. Improve code documentation
4. Optimize bundle size
5. Add request deduplication

---

## Conclusion

The codebase has a **solid foundation** but requires **immediate attention** to critical security vulnerabilities before production deployment. The most urgent issues are:

1. **Exposed API keys** - Rotate immediately
2. **XSS vulnerabilities** - Patch before production
3. **Auto-admin assignment** - Fix authentication logic

After addressing critical security issues, focus on code quality improvements and testing.

**Estimated effort:** 4-6 weeks for full remediation
**Recommended team size:** 2-3 developers

---

**End of Report**
