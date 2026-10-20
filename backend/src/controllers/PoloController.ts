import { Request, Response } from "express";

import { Op } from "sequelize";
import AppError from "../errors/AppError";
import Polo from "../models/Polo";
import PoloMember from "../models/PoloMember";
import Queue from "../models/Queue";
import User from "../models/User";
import Lead from "../models/Lead";
import Ticket from "../models/Ticket";
import { POLO_FUNCTIONS } from "../helpers/Roles";
import { tutorsOfPolo } from "../services/PoloServices/TutorsOfPolo";
import PoloCoverage from "../models/PoloCoverage";
import { cityKeyOf, forgetPolos, stateOf } from "../services/PoloServices/ResolvePolo";
import syncPoloQueues from "../services/PoloServices/SyncPoloQueues";

const withDetails = [
  {
    model: PoloMember,
    as: "members",
    include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }]
  },
  { model: Queue, as: "queues", attributes: ["id", "name", "color", "role", "autoAssign"] }
];

// tutors of a polo (names only): any signed-in user may need to pick one when confirming an enrollment
export const tutors = async (req: Request, res: Response): Promise<Response> => res.json(await tutorsOfPolo(Number(req.params.id)));

export const index = async (req: Request, res: Response): Promise<Response> => {
  const admin = req.user.role === "admin" || req.user.role === "coordenacao" || req.user.profile === "admin";
  const polos = await Polo.findAll({
    order: [["name", "ASC"]],
    ...(admin
      ? { include: withDetails }
      : { attributes: ["id", "code", "name", "city", "state", "active"] })
  });
  return res.json(polos);
};

const clean = (b: any) => {
  const name = String(b.name || "").trim();
  if (name.length < 2) throw new AppError("ERR_POLO_NAME_REQUIRED", 400);
  const state = b.state ? String(b.state).trim().toUpperCase() : null;
  if (state && !/^[A-Z]{2}$/.test(state)) throw new AppError("ERR_POLO_STATE_INVALID", 400);
  return {
    name,
    code: b.code ? String(b.code).trim() : null,
    city: b.city ? String(b.city).trim() : null,
    state,
    active: b.active === undefined ? true : Boolean(b.active)
  };
};

const reload = (id: number) => Polo.findByPk(id, { include: withDetails });

export const store = async (req: Request, res: Response): Promise<Response> => {
  const data = clean(req.body);
  if (data.code && (await Polo.findOne({ where: { code: data.code } }))) {
    throw new AppError("ERR_POLO_CODE_DUPLICATED", 409);
  }
  const polo = await Polo.create(data as any);
  await syncPoloQueues(polo);
  return res.status(201).json(await reload(polo.id));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const polo = await Polo.findByPk(req.params.id);
  if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
  const data = clean({ ...polo.toJSON(), ...req.body });
  if (data.code && data.code !== polo.code && (await Polo.findOne({ where: { code: data.code } }))) {
    throw new AppError("ERR_POLO_CODE_DUPLICATED", 409);
  }
  await polo.update(data);
  await syncPoloQueues(polo);
  forgetPolos();
  return res.json(await reload(polo.id));
};

// the cities the polo serves (the ones the agent matches a lead's city to)
export const coverage = async (req: Request, res: Response): Promise<Response> => {
  const rows = await PoloCoverage.findAll({ where: { poloId: Number(req.params.id) }, order: [["city", "ASC"]] });
  return res.json(rows.map(r => ({ id: r.id, city: r.city, state: r.state })));
};

// body: { cities: ["Candeias do Jamari - RO", { city: "Itapuã do Oeste", state: "RO" }] } — replaces the whole list of the polo. A city belongs to
// one polo (per state): one already used by another polo is refused, naming it.
export const setCoverage = async (req: Request, res: Response): Promise<Response> => {
  const polo = await Polo.findByPk(req.params.id);
  if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
  const list: any[] = Array.isArray(req.body.cities) ? req.body.cities.slice(0, 500) : [];
  const rows = new Map<string, { poloId: number; city: string; cityKey: string; state: string | null }>();
  for (const item of list) {
    const raw = typeof item === "string" ? item : String(item?.city || "");
    const typed = typeof item === "string" ? null : item?.state ? String(item.state).trim().toUpperCase() : null;
    const city = raw.replace(/\s*[-,/]\s*[A-Za-z]{2}\s*$/, "").trim().slice(0, 120);
    const state = typed || stateOf(raw) || polo.state || null;
    const cityKey = cityKeyOf(city);
    if (cityKey.length < 2) continue;
    if (state && !/^[A-Z]{2}$/.test(state)) throw new AppError("ERR_POLO_STATE_INVALID", 400);
    rows.set(`${cityKey}|${state || ""}`, { poloId: polo.id, city, cityKey, state });
  }
  const mine = [...rows.values()];
  if (mine.length) {
    const taken = await PoloCoverage.findAll({ where: { cityKey: mine.map(r => r.cityKey), poloId: { [Op.ne]: polo.id } } as any, include: [{ model: Polo, as: "polo", attributes: ["name"] }] });
    const clash = taken.find(t => rows.has(`${t.cityKey}|${t.state || ""}`));
    if (clash) throw new AppError("ERR_POLO_COVERAGE_DUPLICATED", 409, { city: clash.city, polo: clash.polo?.name || "" });
  }
  await PoloCoverage.destroy({ where: { poloId: polo.id } });
  if (mine.length) await PoloCoverage.bulkCreate(mine as any);
  forgetPolos();
  return coverage(req, res);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const polo = await Polo.findByPk(req.params.id, { include: [{ model: Queue, as: "queues" }] });
  if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
  const queueIds = (polo.queues || []).map(q => q.id);
  const leads = await Lead.count({ where: { poloId: polo.id } });
  const tickets = queueIds.length ? await Ticket.count({ where: { queueId: queueIds } }) : 0;
  if (leads || tickets) throw new AppError("ERR_POLO_IN_USE", 409);
  await PoloMember.destroy({ where: { poloId: polo.id } });
  await Queue.destroy({ where: { poloId: polo.id } });
  await PoloCoverage.destroy({ where: { poloId: polo.id } });
  await polo.destroy();
  forgetPolos();
  return res.json({ message: "deleted" });
};

// body: { members: [{ userId, role }] } — replaces the whole team of the polo
export const setMembers = async (req: Request, res: Response): Promise<Response> => {
  const polo = await Polo.findByPk(req.params.id);
  if (!polo) throw new AppError("ERR_NO_POLO_FOUND", 404);
  const list: any[] = Array.isArray(req.body.members) ? req.body.members : [];
  const seen = new Set<string>();
  const rows: { poloId: number; userId: number; role: string }[] = [];
  for (const m of list) {
    const userId = Number(m.userId);
    if (!userId || !(POLO_FUNCTIONS as readonly string[]).includes(m.role)) {
      throw new AppError("ERR_POLO_MEMBER_INVALID", 400);
    }
    const key = `${userId}:${m.role}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push({ poloId: polo.id, userId, role: m.role });
    }
  }
  const found = await User.count({ where: { id: rows.map(r => r.userId) } });
  if (found !== new Set(rows.map(r => r.userId)).size) throw new AppError("ERR_NO_USER_FOUND", 404);

  await PoloMember.destroy({ where: { poloId: polo.id } });
  if (rows.length) await PoloMember.bulkCreate(rows as any);
  await syncPoloQueues(polo);
  return res.json(await reload(polo.id));
};

// body: { items: [{ code, name, city, state }], dryRun }
export const importPolos = async (req: Request, res: Response): Promise<Response> => {
  const items: any[] = Array.isArray(req.body.items) ? req.body.items.slice(0, 1000) : [];
  const dryRun = Boolean(req.body.dryRun);
  const rows: any[] = [];
  let created = 0;
  let updated = 0;
  for (const [i, it] of items.entries()) {
    const line = i + 1;
    let data;
    try {
      data = clean(it);
    } catch (e) {
      rows.push({ line, status: "error", error: "Nome do polo obrigatório (ou UF inválida)", ...it });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const existing =
      (data.code && (await Polo.findOne({ where: { code: data.code } }))) ||
      (await Polo.findOne({ where: { name: data.name } }));
    if (!dryRun) {
      if (existing) {
        // eslint-disable-next-line no-await-in-loop
        await existing.update(data);
        // eslint-disable-next-line no-await-in-loop
        await syncPoloQueues(existing);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await syncPoloQueues(await Polo.create(data as any));
      }
    }
    if (existing) updated += 1;
    else created += 1;
    rows.push({ line, status: existing ? "update" : "new", ...data });
  }
  return res.json({ created, updated, errors: rows.filter(r => r.status === "error").length, rows, dryRun });
};
