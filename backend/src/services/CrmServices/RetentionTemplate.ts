import { getSetting } from "../../helpers/AppSettings";
import { institutionName } from "../../helpers/Institution";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import User from "../../models/User";
import { TEMPLATE_PACK } from "../CampaignServices/Templates";

// Outside the 24 h of the official API, the retention messages go by an approved Utility template (the cheapest paid category):
// the opening of the relationship department for the risk and hand-written messages, the re-enrollment notice for the cadence.
// The template is linked in Configurações (or automatically when the recommended pack is approved).
export type RetentionTemplateKind = "relacionamento" | "rematricula";
const SETTING: Record<RetentionTemplateKind, string> = { relacionamento: "relacionamento_template_name", rematricula: "rematricula_template_name" };
const PACK_NAME: Record<RetentionTemplateKind, string> = { relacionamento: "retomada_relacionamento", rematricula: "prazo_rematricula" };

const firstOf = (name?: string | null): string => String(name || "").trim().split(/\s+/)[0] || "";
const fill = (body: string, params: string[]): string => body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? "");

export const retentionTemplateName = async (kind: RetentionTemplateKind): Promise<string> =>
  String(await getSetting(SETTING[kind], "")).trim();

export const retentionTemplate = async (kind: RetentionTemplateKind, lead: Lead, userId: number | null, extra: { endsAt?: string | null } = {}): Promise<{
  template: { name: string; language: string; params: string[] };
  text: string;
} | null> => {
  const name = await retentionTemplateName(kind);
  if (!name) return null;
  const language = String(await getSetting(`${SETTING[kind].replace(/_name$/, "_language")}`, "pt_BR")).trim() || "pt_BR";
  let params: string[];
  if (kind === "relacionamento") {
    const user = userId ? await User.findByPk(userId, { attributes: ["id", "name"] }) : null;
    params = [firstOf(lead.name), firstOf(user?.name) || "a equipe"];
  } else {
    const course = lead.courseId ? await Course.findByPk(lead.courseId, { attributes: ["id", "name"] }) : null;
    params = [firstOf(lead.name), String((course as any)?.name || "o seu curso"), extra.endsAt ? extra.endsAt.split("-").reverse().join("/") : "o fim do período"];
  }
  // what the conversation keeps: the text of the recommended template when it is the one linked
  const pack = TEMPLATE_PACK(institutionName()).find(t => t.name === name || t.name === PACK_NAME[kind]);
  const text = pack && pack.name === name ? fill(pack.body, params) : `[Modelo: ${name}]`;
  return { template: { name, language, params }, text };
};
