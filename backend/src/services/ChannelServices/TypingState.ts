// "digitando…" for the web chat, which has no push channel: the agent's typing is read by the
// visitor's widget when it polls. Entries expire by themselves.
const agent = new Map<string, number>();

export const markAgentTyping = (contactNumber: string, ms = 6000): void => {
  agent.set(contactNumber, Date.now() + ms);
};

export const isAgentTyping = (contactNumber: string): boolean => {
  const until = agent.get(contactNumber) || 0;
  if (until <= Date.now()) {
    agent.delete(contactNumber);
    return false;
  }
  return true;
};
