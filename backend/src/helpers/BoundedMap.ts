// A Map that forgets its oldest entries: the in-memory caches of the WhatsApp sessions grow with every contact
// and group they ever see, and a process that runs for weeks must not keep all of them.
export const remember = <K, V>(map: Map<K, V>, key: K, value: V, max = 5000): void => {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
};
