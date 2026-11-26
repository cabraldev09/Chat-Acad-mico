import { Request } from "express";
import { Op, literal } from "sequelize";

import PoloMember from "../models/PoloMember";
import Whatsapp from "../models/Whatsapp";
import { roleOf } from "./Roles";

// WHAT THE COORDINATION REACHES BEYOND THE CRM, BY POLO (ESP-011): the curricular and academic analyses, the students of the portal and the
// connections (WhatsApp numbers and their QR Code). Same rule as the leads (middleware/scope.ts): the administration reaches everything; the
// coordination, only what belongs to a polo it is in (a row with no polo is the administration's); what the coordination created itself stays its own.
// `null` = no limit by polo (the administration and every other profile, which keep the rules they already had).
export const polosOfCoordination = async (req: Request): Promise<number[] | null> =>
  roleOf(req.user as any) === "coordenacao" ? (await PoloMember.findAll({ where: { userId: Number(req.user.id) }, attributes: ["poloId"] })).map(m => m.poloId) : null;

const ids = (polos: number[]): string => {
  const list = polos.map(Number).filter(n => Number.isInteger(n) && n > 0);
  return list.length ? list.join(",") : "0";
};
export const inPolos = (polos: number[]) => ({ [Op.in]: polos.length ? polos : [0] });

// ---- analyses (CurricularAnalyses.poloId; AcademicAnalyses follow their student or their lead) and students (Students.poloId)
export const curricularWhereOf = (polos: number[], me: number): any => ({ [Op.or]: [{ userId: me }, { poloId: inPolos(polos) }] });
export const studentWhereOf = (polos: number[], me: number): any => ({ [Op.or]: [{ responsibleUserId: me }, { poloId: inPolos(polos) }] });
export const academicWhereOf = (polos: number[], me: number): any => ({
  [Op.or]: [
    { userId: me },
    literal(`"AcademicAnalysis"."studentId" IN (SELECT s."id" FROM "Students" s WHERE s."poloId" IN (${ids(polos)}))`),
    literal(`"AcademicAnalysis"."leadId" IN (SELECT l."id" FROM "Leads" l WHERE l."poloId" IN (${ids(polos)}))`)
  ]
});

// ---- connections: one whose owner is in the polos (or is the person); a connection with no owner is the administration's
export const connectionOwnerInPolos = async (polos: number[], me: number, ownerId: number | null | undefined): Promise<boolean> => {
  if (!ownerId) return false;
  if (Number(ownerId) === me) return true;
  if (!polos.length) return false;
  return (await PoloMember.count({ where: { userId: Number(ownerId), poloId: { [Op.in]: polos } } })) > 0;
};

// can this person (a request, or the socket's stand-in) reach this connection? Only for the coordination; the other profiles keep their own rules
export const coordinationReachesConnection = async (req: Request, ownerId: number | null | undefined): Promise<boolean> => {
  const polos = await polosOfCoordination(req);
  if (!polos) return true;
  return connectionOwnerInPolos(polos, Number(req.user.id), ownerId);
};

export const ownerOfConnection = async (whatsappId: number | string): Promise<number | null> =>
  (await Whatsapp.findByPk(whatsappId, { attributes: ["id", "ownerId"] }))?.ownerId || null;
