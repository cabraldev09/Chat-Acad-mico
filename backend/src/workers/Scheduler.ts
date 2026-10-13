import { Op } from "sequelize";

import Schedule from "../models/Schedule";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import SendToContact from "../services/ChannelServices/SendToContact";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";

let busy = false;

const tick = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    const due = await Schedule.findAll({
      where: { status: "pending", sendAt: { [Op.lte]: new Date() } },
      order: [["sendAt", "ASC"]],
      limit: 20
    });

    for (const schedule of due) {
      // claim first so a slow send is not picked up twice
      // eslint-disable-next-line no-await-in-loop
      await schedule.update({ status: "sending" });
      try {
        // eslint-disable-next-line no-await-in-loop
        const contact = await Contact.findByPk(schedule.contactId);
        if (!contact) throw new Error("contact not found");
        const whatsapp = schedule.whatsappId
          ? // eslint-disable-next-line no-await-in-loop
            await Whatsapp.findByPk(schedule.whatsappId)
          : // eslint-disable-next-line no-await-in-loop
            await GetDefaultWhatsApp(schedule.userId || undefined);
        if (!whatsapp) throw new Error("connection not found");

        // eslint-disable-next-line no-await-in-loop
        await SendToContact({
          contact,
          whatsapp,
          body: schedule.body,
          mediaUrl: schedule.mediaUrl
        });
        // eslint-disable-next-line no-await-in-loop
        await schedule.update({ status: "sent", sentAt: new Date(), error: null });
      } catch (err) {
        logger.error(`Schedule ${schedule.id} failed: ${err}`);
        // eslint-disable-next-line no-await-in-loop
        await schedule.update({
          status: "failed",
          error: String(err.message || err).slice(0, 500)
        });
      }
      getIO().emit("schedule", { action: "update", row: schedule });
    }
  } catch (err) {
    logger.error(`Scheduler tick error: ${err}`);
  } finally {
    busy = false;
  }
};

export const startScheduler = (): void => {
  // anything left "sending" by a crash goes back to the queue
  Schedule.update({ status: "pending" }, { where: { status: "sending" } }).catch(() => undefined);
  setInterval(tick, 15000);
};
