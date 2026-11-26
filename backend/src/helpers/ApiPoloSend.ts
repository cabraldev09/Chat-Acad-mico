import { Op } from "sequelize";

import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "./GetDefaultWhatsApp";
import { ApiCaller } from "./ApiTokens";
import { brPhoneVariants } from "./PhoneVariants";
import Lead from "../models/Lead";
import Queue from "../models/Queue";
import Whatsapp from "../models/Whatsapp";
import WhatsappQueue from "../models/WhatsappQueue";

// A token limited to some polos sends only to people of those polos and only through a connection that serves a queue of those polos
// (the old route /api/messages/send, the same rule of the API v1 for the number). A token of every polo is not limited, as before.
// The connection check cannot use middleware/outboundScope.assertConnectionUse: it reads a signed-in user, and an API token has none.
// Runs BEFORE any contact, conversation or file is created, so a refused call leaves nothing behind.
export const assertTokenCanSend = async (caller: ApiCaller, number: string, whatsappId?: unknown): Promise<void> => {
  const polos = caller.poloIds;
  if (!polos) return;
  const allowed = polos.length ? polos : [0];

  const lead = await Lead.count({ where: { phone: { [Op.in]: brPhoneVariants(String(number)) }, poloId: { [Op.in]: allowed } } as any });
  if (!lead) throw new AppError("ERR_API_TOKEN_POLO", 403);

  let whatsapp: Whatsapp | null;
  if (whatsappId === undefined || whatsappId === null || whatsappId === "") {
    whatsapp = await GetDefaultWhatsApp();
  } else {
    const id = Number(whatsappId);
    whatsapp = Number.isInteger(id) && id > 0 ? await Whatsapp.findByPk(id) : null;
  }
  if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);

  const serves = await WhatsappQueue.count({
    where: { whatsappId: whatsapp.id },
    include: [{ model: Queue, required: true, attributes: [], where: { poloId: { [Op.in]: allowed } } }]
  });
  if (!serves) throw new AppError("ERR_API_TOKEN_POLO", 403);
};
