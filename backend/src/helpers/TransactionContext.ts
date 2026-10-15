import { AsyncLocalStorage } from "async_hooks";
import { Transaction } from "sequelize";

// Sequelize's CLS adapter backed by Node's AsyncLocalStorage, without a global mutable transaction.
const storage = new AsyncLocalStorage<Map<string, any>>();
export const transactionContext = {
  run: (fn: (...args: any[]) => any) => storage.run(new Map(storage.getStore()), fn),
  bind: (fn: (...args: any[]) => any) => {
    const context = storage.getStore();
    return (...args: any[]) => storage.run(context || new Map(), () => fn(...args));
  },
  get: (key: string) => storage.getStore()?.get(key),
  set: (key: string, value: any) => { storage.getStore()?.set(key, value); return value; }
};
export const afterCommit = (effect: () => void): void => {
  const transaction: Transaction | undefined = transactionContext.get("transaction");
  if (transaction) transaction.afterCommit(effect);
  else effect();
};
