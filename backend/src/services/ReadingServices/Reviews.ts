import { getSetting } from "../../helpers/AppSettings";
import ConversationReading from "../../models/ConversationReading";
import { reviewCandidates } from "../AnalyticsServices/ConsultantReview";

// the daily review of the consultants' conversations as readings of the queue (when OpenBot reads through the API): one per conversation and day
export const enqueueReviewDay = async (day: string): Promise<number> => {
  const limit = Math.min(500, Math.max(1, Number(await getSetting("consultant_review_max_tickets", "60")) || 60));
  let added = 0;
  for (const c of await reviewCandidates(day, limit)) {
    // eslint-disable-next-line no-await-in-loop
    const [, created] = await ConversationReading.findOrCreate({
      where: { kind: "revisao", ticketId: Number(c.ticketId), ref: day },
      defaults: { kind: "revisao", ticketId: Number(c.ticketId), ref: day, userId: Number(c.userId) || null } as any
    });
    if (created) added += 1;
  }
  return added;
};
