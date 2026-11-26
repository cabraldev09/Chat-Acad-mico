import { AsyncLocalStorage } from "async_hooks";

// Who caused the work being done: the person logged in on the request, or the creator of the campaign or of the scheduled message the
// worker is sending. The Meta messages (OutboundDeliveries) and the AI calls (AiUsage) record it, so the management sees what each
// person spent. Work nobody asked for (automatic answers, audits, the workers' own rounds) has no actor and shows as "Automação".
const store = new AsyncLocalStorage<{ userId: number | null }>();

export const currentActorId = (): number | null => store.getStore()?.userId || null;

export const withActor = <T>(userId: number | null | undefined, fn: () => T): T => store.run({ userId: Number(userId) > 0 ? Number(userId) : null }, fn);

// long-lived listeners (a QR Code session, its message events) must never keep the person who started them
export const withoutActor = <T>(fn: () => T): T => store.run({ userId: null }, fn);
