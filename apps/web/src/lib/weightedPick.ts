export const pickWeightedRandom = <T extends { weight: number }>(
  candidates: readonly T[],
  max: number,
  rng: () => number
): T[] => {
  const available = [...candidates];
  const selected: T[] = [];
  let totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const limit = Math.min(max, available.length);

  for (let i = 0; i < limit; i++) {
    let random = rng() * totalWeight;
    let selectedIndex = available.length - 1;

    for (let j = 0; j < available.length; j++) {
      random -= available[j].weight;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }

    const selectedItem = available[selectedIndex];
    selected.push(selectedItem);
    available.splice(selectedIndex, 1);
    totalWeight -= selectedItem.weight;
  }

  return selected;
};
