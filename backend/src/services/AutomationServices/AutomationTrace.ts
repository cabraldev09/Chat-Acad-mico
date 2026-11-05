import { QueryTypes } from "sequelize";

// What the robot decided about each conversation: "the agent started", "did not start because…", "failed because…".
// It answers "why did the robot not answer" on the screen of the conversation, without anyone reading the server log.
// The last lines of the most recent conversations stay in memory (fast), and every line is also saved in AutomationTraces,
// so the panel still shows what happened after the server restarts (a new version, a crash). DataRetention trims the table.
export interface TraceLine {
  at: number;
  text: string;
}

const MAX_LINES = 14;
const MAX_TICKETS = 200;
const traces = new Map<number, TraceLine[]>();

// the lines waiting to be written (one insert every few seconds, never one per line)
let pending: Array<{ ticketId: number; text: string; at: number }> = [];
let flushTimer: NodeJS.Timeout | null = null;
let db: { query: (sql: string, opts: any) => Promise<any> } | null = null;

const flush = async (): Promise<void> => {
  flushTimer = null;
  if (!db || !pending.length) return;
  const batch = pending.splice(0, 500);
  const values = batch.map((_, i) => `(:t${i}, :x${i}, :a${i})`).join(", ");
  const replacements: Record<string, unknown> = {};
  batch.forEach((l, i) => {
    replacements[`t${i}`] = l.ticketId;
    replacements[`x${i}`] = l.text;
    replacements[`a${i}`] = new Date(l.at);
  });
  try {
    await db.query(`INSERT INTO "AutomationTraces" ("ticketId", "text", "createdAt") VALUES ${values}`, { replacements, type: QueryTypes.INSERT });
  } catch (err) {
    // the memory still has them: the panel keeps working until the next restart
  }
  if (pending.length) flushTimer = setTimeout(() => flush().catch(() => undefined), 2000);
};

// the server gives the database once it is up (the unit tests run without one)
export const persistAutomationTraces = (sequelize: { query: (sql: string, opts: any) => Promise<any> }): void => {
  db = sequelize;
};

export const noteAutomation = (ticketId: number, text: string): void => {
  const id = Number(ticketId);
  if (!id) return;
  const line = { at: Date.now(), text: String(text).slice(0, 300) };
  const lines = traces.get(id) || [];
  lines.push(line);
  traces.delete(id);
  traces.set(id, lines.slice(-MAX_LINES));
  // the oldest conversations go first (a Map keeps the order of insertion)
  while (traces.size > MAX_TICKETS) traces.delete(traces.keys().next().value as number);
  if (db) {
    pending.push({ ticketId: id, ...line });
    if (pending.length > 5000) pending = pending.slice(-5000);
    if (!flushTimer) flushTimer = setTimeout(() => flush().catch(() => undefined), 2000);
  }
};

export const automationTrace = (ticketId: number): TraceLine[] => traces.get(Number(ticketId)) || [];

// The memory and what was saved, together (the saved lines cover what happened before the last restart), newest last
export const storedAutomationTrace = async (ticketId: number): Promise<TraceLine[]> => {
  const id = Number(ticketId);
  const mem = automationTrace(id);
  if (!db || !id) return mem;
  try {
    const rows: any[] = await db.query(`SELECT "text", "createdAt" FROM "AutomationTraces" WHERE "ticketId" = :id ORDER BY "createdAt" DESC, id DESC LIMIT ${MAX_LINES}`, {
      replacements: { id },
      type: QueryTypes.SELECT
    });
    const saved = rows.map(r => ({ at: new Date(r.createdAt).getTime(), text: String(r.text) })).reverse();
    const key = (l: TraceLine) => `${l.at}|${l.text}`;
    const seen = new Set(saved.map(key));
    const all = [...saved, ...mem.filter(l => !seen.has(key(l)))].sort((a, b) => a.at - b.at);
    return all.slice(-MAX_LINES);
  } catch (err) {
    return mem;
  }
};
