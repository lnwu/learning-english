export const setBounded = <K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxSize: number,
  isExpired?: (value: V) => boolean,
): void => {
  if (!map.has(key) && map.size >= maxSize) {
    if (isExpired) {
      for (const [existingKey, existing] of map) {
        if (isExpired(existing)) map.delete(existingKey);
      }
    }
    while (map.size >= maxSize) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }
  map.set(key, value);
};
