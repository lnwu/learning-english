export interface LatestOnly {
  begin: () => number;
  isCurrent: (token: number) => boolean;
}

export const createLatestOnly = (): LatestOnly => {
  let current = 0;

  return {
    begin: () => {
      current += 1;
      return current;
    },
    isCurrent: (token) => token > 0 && token === current,
  };
};
