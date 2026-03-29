import { create } from 'zustand';

export const useRegenerationStore = create((set, get) => ({
  // Map of kitId -> { progress, step, status: 'idle'|'running'|'done'|'error', error }
  jobs: {},

  startJob: (kitId) =>
    set((s) => ({
      jobs: {
        ...s.jobs,
        [kitId]: { progress: 0, step: 'Analyzing job description...', status: 'running', error: null },
      },
    })),

  updateJob: (kitId, progress, step) =>
    set((s) => ({
      jobs: {
        ...s.jobs,
        [kitId]: { ...s.jobs[kitId], progress, step },
      },
    })),

  completeJob: (kitId) =>
    set((s) => ({
      jobs: {
        ...s.jobs,
        [kitId]: { ...s.jobs[kitId], progress: 100, step: 'Done', status: 'done' },
      },
    })),

  failJob: (kitId, error) =>
    set((s) => ({
      jobs: {
        ...s.jobs,
        [kitId]: { ...s.jobs[kitId], status: 'error', error },
      },
    })),

  clearJob: (kitId) =>
    set((s) => {
      const jobs = { ...s.jobs };
      delete jobs[kitId];
      return { jobs };
    }),

  getJob: (kitId) => get().jobs[kitId] || null,
}));
