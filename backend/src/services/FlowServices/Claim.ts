import { Op } from "sequelize";

import Ticket from "../../models/Ticket";

// The AI answers a conversation from one place at a time, even with several servers: the one that writes the mark first is the one that
// talks. The mark expires (default 2 minutes) so a server that died while answering never blocks the conversation.
export const claimAi = async (ticketId: number, ttlSeconds = 120): Promise<boolean> => {
  const cutoff = new Date(Date.now() - ttlSeconds * 1000);
  // `silent`: the conversation keeps its place in the list (updatedAt is not touched)
  const [changed] = await Ticket.update({ aiClaimAt: new Date() } as any, { where: { id: ticketId, [Op.or]: [{ aiClaimAt: null }, { aiClaimAt: { [Op.lt]: cutoff } }] } as any, silent: true } as any);
  return changed > 0;
};

export const releaseAi = async (ticketId: number): Promise<void> => {
  await Ticket.update({ aiClaimAt: null } as any, { where: { id: ticketId }, silent: true } as any).catch(() => undefined);
};
