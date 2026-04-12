
Firestore Architecture - Summary (thorough exploration from repo search)

Plan/location: .sisyphus/plans/*.md is read-only; notepads live under .sisyphus/notepads. This note documents the discovered Firestore storage architecture in this repo.

1) Core Firestore data model (per publication)
- Global master library (shared masters across publications):
  - Path: publishingGlobals/masterLibrary
  - Type: PublishingMasterLibraryDoc (masters, updatedAt, schemaVersion, sourcePublicationTypes, publicationTypes)
- Per-publication editor data (subcollections under publications/{publicationId}):
  - editor/state (META doc): stores PublishingMetaDoc snapshot, including meta, layout, counts, updatedAt, and possibly threads/contributions/master state reference
  - editorPages: collection of PublicationPage documents
  - editorContributions: collection of ContributionItem documents
  - editorMasters: collection of StoredMaster documents (with order)
  - editorAssets: collection of AssetItem documents
  - editorThreads: collection of StoredThread documents (thread data for text flows)
- Per-publication main doc:
  - publications/{publicationId} document with fields like title, status, editorUpdatedAt, publishingVersion, etc.

2) Key Firestore accessors and delta logic (firestore.ts)
- File: /Users/aaron/Developer/personal/ebook/src/lib/publishing/firestore.ts
- Core helpers:
  - page/collection refs: pagesCollection, contributionsCollection, mastersCollection, assetsCollection, threadsCollection
  - metaRef: publications/{publicationId}/editor/state
  - meta/masterLibrary refs: masterLibraryRef()
  - build/serialize helpers: stripUndefinedDeep, cloneDeep, buildMetaDoc, appendCollectionSyncOperations, appendCollectionDeltaOperations
- Delta-based saving (diff-based):
  - Function: appendCollectionDeltaOperations(operations, previousDocs, nextDocs, getDocRef)
  - Behavior: computes diffs between previousDocs and nextDocs by id, queues batch operations for deletions of removed docs and for updated/added docs when changed (hasChanged(prev, next))
  - This is the core delta-based saving mechanism to minimize writes when updating a collection (through a single transaction or multiple 500-item batches)
- Full-sync saving (no prior state):
  - Function: appendCollectionSyncOperations(operations, existingDocs, nextDocs, getDocRef)
  - Behavior: re-writes the entire target collection by deleting nonexistent docs and setting all nextDocs
- Commit strategy:
  - commitOperations(operations): if operations.length <= 500, commit in one batch; else chunk into 500-command batches (FIRESTORE_BATCH_LIMIT = 500). Warns about non-atomic batch execution when chunking
- Data organization in Firestore:
  - Public publications: publications/{publicationId}
  - Editor subcollections under each publication: editor/{state, editorPages, editorContributions, editorMasters, editorAssets, editorThreads}
  - Editor state (state doc) includes meta, contributions, masters, updatedAt, and possibly other fields like contributionCount, masterCount, etc.

3) Thread storage and data model (editorThreads and thread text)
- Threads stored under: publications/{publicationId}/editorThreads
- Code references:
  - threadTextSerialization.ts defines StoredThread (extends PublishingDocument[threads][number] with optional canonicalText)
  - compactContributionThreadText(documentState) trims threads where data can be collapsed to compact representation
  - rehydrateContributionThreadText(documentState, threads) reconstructs canonicalText from slot data when needed
- Thread data structure (PublishingDocument.types):
  - TextThread: id, type: text-flow, canonicalText, semanticRole, styleOverride, ebook (include, toc, readingWidth), originBlockId, sourceZoneId, sourcePageId, zoneSequence, etc.
  - The Editor UI uses a combination of thread objects and page-level blocks to render content and citations; slot-based contributions are mapped to threads via contribution slots (title, authors, body, etc.)

4) How threads and other data are migrated or migrated-related code
- Migration logic (legacyStarterDocument to new structure):
  - In firestore.ts: migrateLegacyStarterDocument(document) converts a legacy starter document into a new published document structure by merging legacy fields into a fresh initial structure (createInitialPublishingDocument) and preserving meta.updatedAt
  - looksLikeLegacyStarterDocument(document): checks for legacy conditions (no contributions, legacy cover page, legacy starter threads) to trigger migration
- Migration scripts under scripts/ (Firebase Admin SDK used for batch migrations):
  - migrate-editor-contributions.ts: Moves legacy contributions array from editor/state into editorContributions collection; backs up legacy data; updates state.contributions to reflect count and storage version
  - migrate-editor-masters.ts: Migrates legacy masters array into editorMasters collection; updates state with new master storage version and masterCount; can write or dry-run
  - restore-editor-pages.ts: Restores editor pages from legacy state, rebuilding pages from masters and zone definitions; used for recovery and historical migrations
- Additional scripts help manage and migrate pages and master layout (e.g., restore-editor-pages.ts, compact-editor-threads.ts)

5) Data model for presenter/author data in Firestore
- Slots and masters drive author/presenter data:
  - Master templates (MasterTemplate) define content zones and slots, including speaker-thread templates with slot schemas for author/title/body fields
  - In defaultDocument.ts, SPEAKER_THREAD_SLOT_SCHEMA includes keys track, title_ko, authors_ko, affiliation_ko, body_ko, title_en, authors_en, affiliation_en, body_en
  - Contributions derive their fields from Slot contents (ContributionSlotContent) and are stored in editorContributions documents; contributions contain id, order, masterId, pageId, status, title, track, presentationTrackId, sourceFileName, createdAt, updatedAt, slots
  - Threads map to slots via sourceZone and flow connections; the system can render threads from either slot data or stored canonicalText, with rehydration logic to reconstruct canonicalText when needed
- Global vs per-publication data:
  - Master library (presenter/author definitions) stored globally under publishingGlobals/masterLibrary
  - Per-publication masters and threads persist in editorMasters and editorThreads, respectively

6) Document size limits and batch behavior
- Firestore batch limit: 500 operations per batch (FIRESTORE_BATCH_LIMIT = 500)
- If total operations > 500, save is chunked into multiple batches with non-atomic behavior for cross-chunk consistency; warning emitted about non-atomic save when chunking
- This behavior is implemented in commitOperations(operations)

7) Auto-save timer logic
- Auto-save state is modeled in the UI store, not strictly in Firestore:
  - File: src/stores/publishingStore.ts
  - AUTOSAVE_DEBOUNCE_MS = 1200 (ms)
  - A global autosaveTimer variable (number | null) to debounce saves
  - Autosave-related state in PublishingEditorState.autosave includes dirty, isSaving, lastSavedAt, lastError, pendingRevision
  - Actions markSaving, markSaved, markSaveFailed indicate the saving lifecycle and reflect autosave status in state
  - The actual timer invocation for saving to Firestore is not in this store file; the store defines the state/trigger scaffolding and a debounce constant; the actual persistence likely happens via the editor UI or a separate side-effect that listens to autosave state and invokes the Firestore save via savePublishingDocument/saveEditorWorkspaceDelta

8) Documented data flow and read paths
- Reading a document (loadPublishingDocument):
  - Reads publication doc, editor/state, masterLibrary, editorPages (ordered by pageNumber), editorContributions (ordered by contribution order), editorMasters (ordered), editorAssets, editorThreads
  - Rehydrates global masters, builds final PublishingDocument by stitching data from meta/state and per-collection docs
  - If there are no editorThreads docs but there are threads in meta, it backfills the editorThreads collection by syncing meta.threads into the subcollection
- Writing a document (savePublishingDocument/saveEditorWorkspace / saveEditorWorkspaceDelta):
  - Writes to editor/state (meta/doc), and then uses delta or sync operations to update the subcollections editorPages, editorContributions, editorMasters, editorAssets, editorThreads
  - For threads, uses compactContributionThreadText to minimize data and uses appendCollectionDeltaOperations when there is a previousDocument; otherwise uses full sync via appendCollectionSyncOperations
- Migration from legacy meta to subcollections: handled via dedicated scripts under scripts/ and via migrateLegacyStarterDocument logic in firestore.ts (and related migration scripts)

9) Notable cross-references and helper modules
- contributionLayout.ts: used to compute thread association to contributions (slot keys, thread location, etc.)
- threadTextSerialization.ts: handles StoredThread type and functions to normalize and rehydrate thread canonicalText
- defaultDocument.ts: defines initial masters/pages/templates and slot schemas used by the Firestore layer to store data
- types/publishing.ts: defines PublishingDocument, AutosaveState, and all data shapes used by the Firestore layer
- firebase.ts: initializes the Firestore instance (db) and reducers for emulator support in DEV environment
- scripts/* migration files: admin Firestore code for moving legacy data to subcollections with backups

10) Quick guide to locate relevant code for this task
- Firestore writing/diffing logic: /Users/aaron/Developer/personal/ebook/src/lib/publishing/firestore.ts
- Delta-based collection updates: appendCollectionDeltaOperations / appendCollectionSyncOperations (in the same file)
- Editor subcollections structure: editorPages, editorContributions, editorMasters, editorAssets, editorThreads under publications/{publicationId}
- Threads data model and serialization: /Users/aaron/Developer/personal/ebook/src/lib/publishing/threadTextSerialization.ts
- Master/global data: /Users/aaron/Developer/personal/ebook/src/lib/publishing/defaultDocument.ts and /Users/aaron/Developer/personal/ebook/src/stores/publishingStore.ts (autosave)
- Autofill migration scripts (legacy to subcollections): /Users/aaron/Developer/personal/ebook/scripts/migrate-editor-contributions.ts, scripts/migrate-editor-masters.ts, scripts/restore-editor-pages.ts
- Migration helpers and legacy migration logic: /Users/aaron/Developer/personal/ebook/src/lib/publishing/firestore.ts (migrateLegacyStarterDocument, looksLikeLegacyStarterDocument)
- Firestore initialization: /Users/aaron/Developer/personal/ebook/src/lib/firebase.ts
