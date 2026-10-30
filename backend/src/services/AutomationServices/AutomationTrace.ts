// What the robot decided about each conversation, kept in memory (one server): "the agent started", "did not start because…", "failed because…".
// It answers "why did the robot not answer" on the screen of the conversation, without anyone reading the server log. The last lines of each
// conversation are kept, and only the most recent conversations.
export interface TraceLine {
  at: number;
  text: string;
}

const MAX_LINES = 14;
const MAX_TICKETS = 200;
const traces = new Map<number, TraceLine[]>();

export const noteAutomation = (ticketId: number, text: string): void => {
  const id = Number(ticketId);
  if (!id) return;
  const lines = traces.get(id) || [];
  lines.push({ at: Date.now(), text: String(text).slice(0, 300) });
  traces.delete(id);
  traces.set(id, lines.slice(-MAX_LINES));
  // the oldest conversations go first (a Map keeps the order of insertion)
  while (traces.size > MAX_TICKETS) traces.delete(traces.keys().next().value as number);
};

export const automationTrace = (ticketId: number): TraceLine[] => traces.get(Number(ticketId)) || [];
