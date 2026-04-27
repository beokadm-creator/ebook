import { StateCreator } from 'zustand';
import { PublishingStore } from '@/stores/publishingStore'; // We will export it from there for now

export interface HistorySlice {
  markSaving: () => void;
  markSaved: () => void;
  markSaveFailed: (message: string) => void;
  undo: () => void;
  redo: () => void;
}

export const createHistorySlice: StateCreator<PublishingStore, [], [], HistorySlice> = (set) => ({
  markSaving: () =>
    set((state) => ({
      autosave: {
        ...state.autosave,
        isSaving: true,
        lastError: null,
      },
    })),

  markSaved: () =>
    set((state) => ({
      autosave: {
        ...state.autosave,
        dirty: false,
        isSaving: false,
        pendingRevision: null,
        lastSavedAt: new Date().toISOString(),
      },
    })),

  markSaveFailed: (message) =>
    set((state) => ({
      autosave: {
        ...state.autosave,
        isSaving: false,
        lastError: message,
      },
    })),

  undo: () =>
    set((state) => {
      const entry = state.history.undoStack[state.history.undoStack.length - 1];
      if (!entry) {
        return state;
      }

      const currentDocument = state.document;
      return {
        document: entry.document,
        history: {
          revision: state.history.revision + 1,
          undoStack: state.history.undoStack.slice(0, -1),
          redoStack: [
            ...state.history.redoStack,
            {
              revision: state.history.revision,
              label: `Redo ${entry.label}`,
              timestamp: new Date().toISOString(),
              document: currentDocument,
            },
          ],
        },
        autosave: {
          ...state.autosave,
          dirty: true,
          pendingRevision: state.history.revision + 1,
        },
      };
    }),

  redo: () =>
    set((state) => {
      const entry = state.history.redoStack[state.history.redoStack.length - 1];
      if (!entry) {
        return state;
      }

      const currentDocument = state.document;
      return {
        document: entry.document,
        history: {
          revision: state.history.revision + 1,
          undoStack: [
            ...state.history.undoStack,
            {
              revision: state.history.revision,
              label: `Undo ${entry.label}`,
              timestamp: new Date().toISOString(),
              document: currentDocument,
            },
          ],
          redoStack: state.history.redoStack.slice(0, -1),
        },
        autosave: {
          ...state.autosave,
          dirty: true,
          pendingRevision: state.history.revision + 1,
        },
      };
    }),
});
