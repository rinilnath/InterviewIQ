import { create } from 'zustand';

// Tracks kits currently being generated across navigation.
// Used by KitCompletionWatcher (App.jsx) to fire toasts when any kit lands.
export const useGeneratingKitsStore = create((set) => ({
  kits: {}, // { [kitId]: { title } }

  add(id, title) {
    set((s) => ({ kits: { ...s.kits, [id]: { title } } }));
  },

  remove(id) {
    set((s) => {
      const next = { ...s.kits };
      delete next[id];
      return { kits: next };
    });
  },
}));
