import { AsyncLocalStorage } from "async_hooks";

// A direct response to an inbound message may use the agent's 24-hour attendance.
// Scheduled workers start outside this context and still obey business hours.
const context = new AsyncLocalStorage<number>();
export const withReactiveReply = <T>(work: () => Promise<T>): Promise<T> => context.run(Date.now() + 5 * 60000, work);
export const isReactiveReply = (): boolean => (context.getStore() || 0) > Date.now();
