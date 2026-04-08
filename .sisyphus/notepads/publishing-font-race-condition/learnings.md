# Learnings: Publishing Font Race Condition Fix

## Date: 2026-04-08

## Problem
The pagination measurement in `PublishingEditorShell.tsx` was running before the `Noto Serif KR` font was fully loaded, causing inaccurate text measurements with fallback fonts.

## Solution
Wrapped the pagination measurement logic in `document.fonts.ready.then(measure)` to ensure fonts are loaded before measuring.

## Implementation Details

### Key Challenge: Variable Shadowing
The component destructures `document` from `usePublishingStore()`, which shadows the global browser `document` object. This caused a TypeScript error when trying to access `document.fonts.ready`.

### Fix: Early Reference Capture
```typescript
const PublishingEditorShell: React.FC<PublishingEditorShellProps> = ({ publicationId }) => {
  const domDocument = window.document;  // Capture global document before shadowing
  const {
    document,  // This shadows the global document
    // ... other store values
  } = usePublishingStore();
```

### Modified useEffect
```typescript
useEffect(() => {
  if (!measurementRootRef.current || !pagination.invalidatedThreadIds.length) {
    return;
  }

  const measure = () => {
    pagination.invalidatedThreadIds.forEach((threadId) => {
      try {
        const segments = paginateThreadWithDom(document, threadId, measurementRootRef.current!);
        if (segments.length) {
          applyPaginationResult(threadId, segments);
        }
      } catch (error) {
        logError(error, `PublishingEditor-pagination:${threadId}`);
      }
    });
  };

  domDocument.fonts.ready.then(measure);  // Wait for fonts
}, [applyPaginationResult, document, pagination.invalidatedThreadIds]);
```

## Key Takeaways

1. **`document.fonts.ready` Promise**: Browser API that resolves when all queued font loads are complete. Safe to call even if fonts are already loaded (resolves immediately).

2. **Variable Shadowing**: When a component-level variable (`document` from store) shadows a global API, capture the global reference before the shadowing occurs.

3. **Font Loading Race Conditions**: Always ensure fonts are loaded before performing DOM measurements that depend on text rendering.

4. **Type Safety**: TypeScript respects variable shadowing, so explicit references to global objects may be needed when they're shadowed by local variables.

## Related
- Session ID: ses_292ce9f7dffewDCykdfeEiwVDX (previous domPagination fix)
