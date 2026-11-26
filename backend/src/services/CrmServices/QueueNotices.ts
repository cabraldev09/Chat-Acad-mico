import { Op } from "sequelize";

import { getIO } from "../../libs/socket";
import Notification from "../../models/Notification";
import User from "../../models/User";
import { logger } from "../../utils/logger";

// The notices of the common queue (helpers/LeadQueue): "new lead in the queue" goes once to every consultant, and goes away when somebody assumes it.
export const queueNoticeKey = (leadId: number): string => `queue-lead:${leadId}`;

// the consultants (the group that takes from the queue)
export const consultantIds = async (): Promise<number[]> =>
  (await User.findAll({ where: { role: "consultor", profile: { [Op.ne]: "admin" } } as any, attributes: ["id"] })).map(u => u.id);

// After the commit of a claim: the other consultants drop the card, and the group's notice is marked as read (resolved), for everybody.
export const leadClaimed = (leadId: number, ownerId: number): void => {
  try { getIO().emit("lead", { action: "claimed", leadId, ownerId }); } catch (err) { logger.warn(`Claim of lead ${leadId}: live update failed: ${err}`); }
  Notification.update({ readAt: new Date() } as any, { where: { dedupeKey: queueNoticeKey(leadId), readAt: { [Op.is]: null } } as any })
    .catch(() => undefined);
};
