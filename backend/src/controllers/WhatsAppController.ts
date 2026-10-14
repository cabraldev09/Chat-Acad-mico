import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";

import CreateWhatsAppService from "../services/WhatsappService/CreateWhatsAppService";
import DeleteWhatsAppService from "../services/WhatsappService/DeleteWhatsAppService";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import { whatsappProvider } from "../providers/WhatsApp";
import { getAdapter } from "../channels";
import AppError from "../errors/AppError";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import { getSetting } from "../helpers/AppSettings";

const isAdminReq = (req: Request) => req.user.profile === "admin";
const me = (req: Request) => Number(req.user.id);
// QR Codes are only shown to administrators and to the person who owns the number
const present = (req: Request, w: Whatsapp) => {
  const json: any = w.toJSON();
  if (!isAdminReq(req) && w.ownerId !== me(req)) delete json.qrcode;
  return json;
};

interface WhatsappData {
  name: string;
  queueIds: number[];
  greetingMessage?: string;
  farewellMessage?: string;
  status?: string;
  isDefault?: boolean;
  channel?: string;
  config?: string;
  businessHours?: string;
  outOfHoursMessage?: string;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const all = await ListWhatsAppsService();
  // shared numbers (the administrator's) plus the person's own; never someone else's personal number
  const visible = isAdminReq(req) ? all : all.filter(w => !w.ownerId || w.ownerId === me(req));

  return res.status(200).json(visible.map(w => present(req, w)));
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  let {
    name,
    // eslint-disable-next-line prefer-const
    status,
    // eslint-disable-next-line prefer-const
    isDefault,
    // eslint-disable-next-line prefer-const
    greetingMessage,
    // eslint-disable-next-line prefer-const
    farewellMessage,
    // eslint-disable-next-line prefer-const
    queueIds,
    // eslint-disable-next-line prefer-const
    channel,
    // eslint-disable-next-line prefer-const
    config,
    // eslint-disable-next-line prefer-const
    businessHours,
    // eslint-disable-next-line prefer-const
    outOfHoursMessage
  }: WhatsappData = req.body;
  let ownerId: number | null = req.body.ownerId ? Number(req.body.ownerId) : null;

  // each QR Code number runs its own Chromium (about 500 MB): past the server's capacity everything would be killed
  if ((channel || "whatsapp") === "whatsapp" || !isAdminReq(req)) {
    const cap = Number(process.env.WHATSAPP_MAX_QR || 8);
    if ((await Whatsapp.count({ where: { channel: "whatsapp" } })) >= cap) throw new AppError("ERR_CONNECTION_CAPACITY", 400);
  }

  if (!isAdminReq(req)) {
    // anyone else connects only their own QR Code number, up to the limit the administrator set
    const limit = Number(await getSetting("max_connections_per_user", "1")) || 1;
    if ((await Whatsapp.count({ where: { ownerId: me(req) } })) >= limit) throw new AppError("ERR_CONNECTION_LIMIT", 400);
    const user = await User.findByPk(me(req));
    const first = String(user?.name || "Usuário").split(" ")[0];
    let candidate = String(name || "").trim().length >= 2 ? String(name).trim() : `WhatsApp de ${first}`;
    for (let n = 2; await Whatsapp.findOne({ where: { name: candidate } }); n += 1) candidate = `WhatsApp de ${first} ${n}`;
    name = candidate;
    channel = "whatsapp";
    queueIds = [];
    config = undefined;
    status = undefined;
    isDefault = false;
    ownerId = me(req);
  }

  const { whatsapp, oldDefaultWhatsapp } = await CreateWhatsAppService({
    name,
    status,
    isDefault,
    greetingMessage,
    farewellMessage,
    queueIds,
    channel,
    config,
    businessHours,
    outOfHoursMessage,
    ownerId
  });

  // the person's own number becomes their sending number (unless they already use another number of theirs)
  if (ownerId) {
    const owner = await User.findByPk(ownerId);
    if (owner) {
      const current = owner.whatsappId
        ? await Whatsapp.findByPk(owner.whatsappId, { attributes: ["id", "ownerId"] })
        : null;
      if (!current || current.ownerId !== ownerId) await owner.update({ whatsappId: whatsapp.id });
    }
  }

  StartWhatsAppSession(whatsapp);

  const io = getIO();
  io.emit("whatsapp", {
    action: "update",
    whatsapp
  });

  if (oldDefaultWhatsapp) {
    io.emit("whatsapp", {
      action: "update",
      whatsapp: oldDefaultWhatsapp
    });
  }

  return res.status(200).json(whatsapp);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;

  const whatsapp = await ShowWhatsAppService(whatsappId);
  if (!isAdminReq(req) && whatsapp.ownerId && whatsapp.ownerId !== me(req)) throw new AppError("ERR_NO_PERMISSION", 403);

  return res.status(200).json(present(req, whatsapp));
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  // the owner may only rename their number; everything else is the administrator's
  const whatsappData = isAdminReq(req) ? req.body : { name: req.body.name };

  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppService({
    whatsappData,
    whatsappId
  });

  // API based channels pick up new credentials by restarting
  if (whatsapp.channel !== "whatsapp" && whatsappData.config !== undefined) {
    StartWhatsAppSession(whatsapp);
  }

  const io = getIO();
  io.emit("whatsapp", {
    action: "update",
    whatsapp
  });

  if (oldDefaultWhatsapp) {
    io.emit("whatsapp", {
      action: "update",
      whatsapp: oldDefaultWhatsapp
    });
  }

  return res.status(200).json(whatsapp);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;

  const existing = await ShowWhatsAppService(whatsappId);
  await DeleteWhatsAppService(whatsappId);
  if (existing.channel !== "whatsapp") {
    await getAdapter(existing.channel).stop(existing);
  } else {
    whatsappProvider.removeSession(+whatsappId);
  }

  const io = getIO();
  io.emit("whatsapp", {
    action: "delete",
    whatsappId: +whatsappId
  });

  return res.status(200).json({ message: "Whatsapp deleted." });
};
