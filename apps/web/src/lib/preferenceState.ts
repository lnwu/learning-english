export interface PreferenceState<T> {
  get: () => T;
  beginLoad: (userId: string) => number | null;
  applyLoad: (token: number, value: T) => boolean;
  failLoad: (token: number) => void;
  applySave: (userId: string, value: T) => boolean;
  reset: () => boolean;
}

export const createPreferenceState = <T>(initial: T): PreferenceState<T> => {
  let current = initial;
  let loadedUserId: string | null = null;
  let generation = 0;

  return {
    get: () => current,
    beginLoad: (userId) => {
      if (loadedUserId === userId) return null;
      loadedUserId = userId;
      generation += 1;
      return generation;
    },
    applyLoad: (token, value) => {
      if (token !== generation || Object.is(value, current)) return false;
      current = value;
      return true;
    },
    failLoad: (token) => {
      if (token === generation) loadedUserId = null;
    },
    applySave: (userId, value) => {
      loadedUserId = userId;
      generation += 1;
      if (Object.is(value, current)) return false;
      current = value;
      return true;
    },
    reset: () => {
      loadedUserId = null;
      generation += 1;
      if (Object.is(current, initial)) return false;
      current = initial;
      return true;
    },
  };
};
