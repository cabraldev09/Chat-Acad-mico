import { Op } from "sequelize";

import CopilotRequest from "../../models/CopilotRequest";

// How close the text the consultant sent is to the suggestion: share of the suggestion's words that went out (0..1)
export const closeness = (suggested: string, sent: string): number => {
  const words = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
  const a = words(suggested);
  if (!a.length) return 0;
  const b = new Set(words(sent));
  return a.filter(w => b.has(w)).length / a.length;
};

// The consultant took a suggestion ("Usar e editar") and then sent a message in the same conversation: it counts as used as it was,
// or edited. Only the last suggestion taken in the last 15 minutes, once.
export const noteSuggestionSent = async (ticketId: number, userId: number, body: string): Promise<void> => {
  const text = String(body || "").replace(/^\*[^*\n]{1,60}:\*\n/, "").trim();
  if (!text) return;
  const taken = await CopilotRequest.findOne({
    where: { ticketId, userId, outcome: "taken", updatedAt: { [Op.gt]: new Date(Date.now() - 15 * 60000) } } as any,
    order: [["updatedAt", "DESC"]]
  });
  if (!taken) return;
  const share = closeness(taken.text || "", text);
  await taken.update({ outcome: share >= 0.9 ? "used" : share >= 0.3 ? "edited" : "discarded" });
};
