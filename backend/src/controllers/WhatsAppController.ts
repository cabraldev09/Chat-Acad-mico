import { normalizePairingPhone } from "../helpers/PairingPhone";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";

import CreateWhatsAppService from "../services/WhatsappService/CreateWhatsAppService";
import DeleteWhatsAppService from "../services/WhatsappService/DeleteWhatsAppService";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import Institution from "../models/Institution";
import { forgetInstitutions } from "../helpers/Institution";
import { whatsappProvider } from "../providers/WhatsApp";
import { getAdapter } from "../channels";
import AppError from "../errors/AppError";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { startOfTodayApp } from "../helpers/AppTime";
import { QueryTypes } from "sequelize";
import { connectionOwnerInPolos, coordinationReachesConnection, polosOfCoordination } from "../helpers/PoloAccess";

const isAdminReq = (req: Request) => isManagerRole(roleOf(req.user));
const me = (req: Request) => Number(req.user.id);
// QR Codes are only shown to the administrators and to the person who owns the number: the QR Code is the login of that WhatsApp
const present = (req: Request, w: Whatsapp) => {
  const json: any = w.toJSON();
  if (roleOf(req.user) !== "admin" && w.ownerId !== me(req)) delete json.qrcode;
  return json;
};

// The connections the person may see: the administration all of them; the coordination only the numbers of people of its polos (a connection with no
// owner, the institution's, is the administration's); everybody else the shared numbers plus their own (never someone else's personal number)
const visibleTo = async (req: Request, all: Whatsapp[]): Promise<Whatsapp[]> => {
  const polos = await polosOfCoordination(req);
  if (polos) {
    const owners = [...new Set(all.map(w => w.ownerId).filter(Boolean) as number[])];
    const ok = new Set<number>();
    for (const id of owners) if (await connectionOwnerInPolos(polos, me(req), id)) ok.add(id); // eslint-disable-line no-await-in-loop
    return all.filter(w => !!w.ownerId && ok.has(w.ownerId));
  }
  return isAdminReq(req) ? all : all.filter(w => !w.ownerId || w.ownerId === me(req));
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
  const visible = await visibleTo(req, all);

  return res.status(200).json(visible.map(w => present(req, w)));
};

// The state of every connection the person may see, with what it did today: who is down, since when, the last message.
export const health = async (req: Request, res: Response): Promise<Response> => {
  const all = await ListWhatsAppsService();
  const visible = await visibleTo(req, all);
  const start = startOfTodayApp();
  const [today, last] = await Promise.all([
    Whatsapp.sequelize!.query(
      `SELECT t."whatsappId" AS id, SUM(CASE WHEN m."fromMe" THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN m."fromMe" THEN 0 ELSE 1 END) AS received
         FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE m."createdAt" >= :start GROUP BY t."whatsappId"`,
      { replacements: { start }, type: QueryTypes.SELECT }
    ) as unknown as Promise<any[]>,
    Whatsapp.sequelize!.query(`SELECT "whatsappId" AS id, MAX("lastMessageAt") AS last FROM "Tickets" GROUP BY "whatsappId"`, { type: QueryTypes.SELECT }) as unknown as Promise<any[]>
  ]);
  const owners = await User.findAll({ where: { id: visible.map(w => w.ownerId).filter(Boolean) as number[] }, attributes: ["id", "name"] });
  return res.json(
    visible.map(w => {
      const t = today.find(x => Number(x.id) === w.id);
      const l = last.find(x => Number(x.id) === w.id);
      return {
        id: w.id,
        name: w.name,
        channel: w.channel || "whatsapp",
        status: w.status,
        statusSince: w.statusSince,
        ownerId: w.ownerId,
        ownerName: owners.find(o => o.id === w.ownerId)?.name || null,
        aiFirst: !!w.aiFirst,
        team: w.team || null,
        sentToday: t ? Number(t.sent) : 0,
        receivedToday: t ? Number(t.received) : 0,
        lastMessageAt: l ? l.last : null
      };
    })
  );
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
  // the coordination creates only numbers of people of its polos (a number with no owner is the institution's: the administration's)
  const myPolos = await polosOfCoordination(req);
  if (myPolos && !(await connectionOwnerInPolos(myPolos, me(req), ownerId))) throw new AppError("ERR_NO_PERMISSION", 403);

  // each QR Code number runs its own Chromium (about 500 MB): past the server's capacity everything would be killed
  if ((channel || "whatsapp") === "whatsapp" || !isAdminReq(req)) {
    const cap = Number(process.env.WHATSAPP_MAX_QR || 8);
    if ((await Whatsapp.count({ where: { channel: "whatsapp" } })) >= cap) throw new AppError("ERR_CONNECTION_CAPACITY", 400);
  }

  // only the management reaches this (route); a number given to a person belongs to a real user and is never the default
  if (ownerId) {
    if (!(await User.count({ where: { id: ownerId } }))) throw new AppError("ERR_NO_USER_FOUND", 404);
    isDefault = false;
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
  // what a shared number is for (atendimento / tutoria): chosen by the administration
  if (!ownerId && isAdminReq(req) && (req.body.team === "atendimento" || req.body.team === "tutoria")) await whatsapp.update({ team: req.body.team });
  // the university it speaks for, chosen by the administration (empty = the default one)
  if (isAdminReq(req) && Number(req.body.institutionId) > 0) {
    if (await Institution.count({ where: { id: Number(req.body.institutionId) } as any })) {
      await whatsapp.update({ institutionId: Number(req.body.institutionId) } as any);
      forgetInstitutions();
    }
  }

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

  // connecting with the pairing code: the number is typed here and the code appears instead of the QR Code
  if (req.body.pairingPhone) {
    const phone = normalizePairingPhone(req.body.pairingPhone);
    if (!phone) throw new AppError("ERR_INVALID_PHONE", 400);
    await whatsapp.update({ pairingPhone: phone });
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

// a person connects their own WhatsApp by QR Code: the number is theirs (only they and the management see its QR Code), it starts with the
// protection against blocking in "strict" and becomes their sending number
export const storeMine = async (req: Request, res: Response): Promise<Response> => {
  const userId = me(req);
  const user = await User.findByPk(userId, { attributes: ["id", "name", "whatsappId"] });
  if (!user) throw new AppError("ERR_NO_USER_FOUND", 404);
  if (await Whatsapp.count({ where: { ownerId: userId, channel: "whatsapp" } })) throw new AppError("ERR_QR_ALREADY_HAS", 409);
  const cap = Number(process.env.WHATSAPP_MAX_QR || 8);
  if ((await Whatsapp.count({ where: { channel: "whatsapp" } })) >= cap) throw new AppError("ERR_CONNECTION_CAPACITY", 400);

  const first = String(user.name || "").trim().split(/\s+/)[0] || "Equipe";
  const base = `WhatsApp de ${first}`;
  // the name is unique among the connections
  let name = base;
  for (let i = 2; await Whatsapp.count({ where: { name } }); i += 1) name = `${base} (${i})`;
  const { whatsapp } = await CreateWhatsAppService({ name, status: "OPENING", isDefault: false, queueIds: [], channel: "whatsapp", ownerId: userId } as any);
  await whatsapp.update({ riskMode: "strict" } as any);

  const current = user.whatsappId ? await Whatsapp.findByPk(user.whatsappId, { attributes: ["id", "ownerId"] }) : null;
  if (!current || current.ownerId !== userId) await user.update({ whatsappId: whatsapp.id });

  if (req.body && req.body.pairingPhone) {
    const phone = normalizePairingPhone(req.body.pairingPhone);
    if (!phone) throw new AppError("ERR_INVALID_PHONE", 400);
    await whatsapp.update({ pairingPhone: phone });
  }

  StartWhatsAppSession(whatsapp);
  getIO().emit("whatsapp", { action: "update", whatsapp });
  return res.status(200).json(present(req, whatsapp));
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;

  const whatsapp = await ShowWhatsAppService(whatsappId);
  if (!(await coordinationReachesConnection(req, whatsapp.ownerId))) throw new AppError("ERR_NO_PERMISSION", 403);
  if (!isAdminReq(req) && whatsapp.ownerId && whatsapp.ownerId !== me(req)) throw new AppError("ERR_NO_PERMISSION", 403);

  return res.status(200).json(present(req, whatsapp));
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  // the coordination hands a number only to people of its polos (never back to the institution: that is the administration's)
  const polosOf = await polosOfCoordination(req);
  if (polosOf && req.body.ownerId !== undefined && !(await connectionOwnerInPolos(polosOf, me(req), Number(req.body.ownerId) > 0 ? Number(req.body.ownerId) : null))) throw new AppError("ERR_NO_PERMISSION", 403);
  // the owner of a QR Code number chooses which of its groups become conversations; everything else is the management's
  const whatsappData = isAdminReq(req)
    ? req.body
    : ["groupsMode", "allowedGroups"].reduce(
        (acc: Record<string, unknown>, key) => {
          if (req.body[key] !== undefined) acc[key] = req.body[key];
          return acc;
        },
        {}
      );

  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppService({
    whatsappData,
    whatsappId
  });

  // the management gives a QR Code number to a person (or takes it back to the company): it becomes their sending number
  if (isAdminReq(req) && req.body.ownerId !== undefined && (whatsapp.channel || "whatsapp") === "whatsapp") {
    const ownerId = Number(req.body.ownerId) > 0 ? Number(req.body.ownerId) : null;
    if (ownerId && !(await User.count({ where: { id: ownerId } }))) throw new AppError("ERR_NO_USER_FOUND", 404);
    if (ownerId !== (whatsapp.ownerId || null)) {
      await whatsapp.update({ ownerId, ...(ownerId ? { team: null, isDefault: false } : {}) } as any);
      if (ownerId) {
        const owner = await User.findByPk(ownerId);
        if (owner) {
          const current = owner.whatsappId ? await Whatsapp.findByPk(owner.whatsappId, { attributes: ["id", "ownerId"] }) : null;
          if (!current || current.ownerId !== ownerId) await owner.update({ whatsappId: whatsapp.id });
        }
      }
    }
  }

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

  return res.status(200).json(present(req, whatsapp));
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;

  const existing = await ShowWhatsAppService(whatsappId);
  if (!(await coordinationReachesConnection(req, existing.ownerId))) throw new AppError("ERR_NO_PERMISSION", 403);
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
