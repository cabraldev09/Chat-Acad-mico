import { getSetting } from "../../helpers/AppSettings";
import Whatsapp from "../../models/Whatsapp";

// Two sides talk to a student, each on its own number: the consultants ("atendimento": enrollment, sales) and the tutors ("tutoria": the
// enrolled students). Each side keeps its own conversations (segment), its own owner of the client and its own history.
export type Team = "atendimento" | "tutoria";

// the segments of each side (helpers/Roles: consultants see sales/postsale, tutors onboarding/support)
export const TUTORIA_SEGMENTS = ["onboarding", "support"];
export const sideOfSegment = (segment?: string | null): "tutoria" | "relationship" | "atendimento" =>
  TUTORIA_SEGMENTS.includes(String(segment || "")) ? "tutoria" : segment === "relationship" ? "relationship" : "atendimento";
export const segmentsOfSide = (side: ReturnType<typeof sideOfSegment>): string[] | null =>
  side === "tutoria" ? TUTORIA_SEGMENTS : side === "relationship" ? ["relationship"] : null;

// what a number is for: its own setting, or the tutoring number of the administration (Configurações → Tutoria)
export const teamOfConnection = async (whatsappId: number | null | undefined): Promise<Team | null> => {
  if (!whatsappId) return null;
  const w = await Whatsapp.findByPk(whatsappId, { attributes: ["id", "team"] });
  if (w?.team === "atendimento" || w?.team === "tutoria") return w.team;
  return Number(await getSetting("tutoria_whatsapp_id", "0")) === Number(whatsappId) ? "tutoria" : null;
};

// the number of a side: the official one first (it never gets banned), then any number of that side
export const connectionOfTeam = async (team: Team): Promise<Whatsapp | null> => {
  const all = await Whatsapp.findAll({ where: { team } as any, order: [["id", "ASC"]] });
  const pick = all.find(w => w.channel === "whatsapp_cloud" && w.status === "CONNECTED") || all.find(w => w.channel === "whatsapp_cloud") || all.find(w => w.status === "CONNECTED") || all[0];
  if (pick) return pick;
  if (team !== "tutoria") return null;
  const legacy = Number(await getSetting("tutoria_whatsapp_id", "0")) || 0;
  return legacy ? Whatsapp.findByPk(legacy) : null;
};
