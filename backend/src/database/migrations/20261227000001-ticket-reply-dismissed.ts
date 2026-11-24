import { QueryInterface, DataTypes } from "sequelize";

// "Já resolvido" in Responder agora: the last message of the client that needs no answer (an "ok", a thank you). The conversation leaves
// the list and the count until the client writes again (a new last message is a different id).
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = await q.describeTable("Tickets");
    if (!(cols as any).replyDismissedMessageId) await q.addColumn("Tickets", "replyDismissedMessageId", { type: DataTypes.STRING, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Tickets", "replyDismissedMessageId");
  }
};
