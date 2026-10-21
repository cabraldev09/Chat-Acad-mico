// Runs the tasks of the same key one after the other (the tasks of other keys do not wait). Two messages of the same person that arrive together would both
// look for an open conversation, find none and create two; with the lock the second one finds the first.
const tails = new Map<string, Promise<unknown>>();

export const withKeyLock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = tails.get(key) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    // nobody queued behind this task: the key is forgotten (the map does not grow)
    if (tails.get(key) === tail) tails.delete(key);
  }
};
