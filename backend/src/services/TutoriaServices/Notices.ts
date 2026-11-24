import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { todayInAppTz } from "../../helpers/AppTime";
import Campaign from "../../models/Campaign";
import ContactList from "../../models/ContactList";
import ContactListItem from "../../models/ContactListItem";
import Lead from "../../models/Lead";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { connectionOfTeam } from "../ChannelServices/ConnectionTeam";
import { ensureShippings } from "../CampaignServices/Shippings";
import { CampaignCost, assertCampaignCost, campaignCost } from "../CampaignServices/CostGate";
import { TEMPLATE_PACK, approvedTemplates, cleanParam, fillTemplate } from "../CampaignServices/Templates";
import type { SendQuota } from "../CampaignServices/SendQuota";

// Avisos da tutoria: the two notices of the month to the students (a summary of the activities and a reminder in the week of the test),
// sent through the official tutoring number with a Utility template, by the campaign queue. One number serves the 8 polos; each
// student keeps their tutor. A QR Code number never sends these in bulk (it would be blocked), and nothing goes out past the cap of the
// month. The screen shows the preview (how many, how much) and the team confirms before anything is sent.

export type NoticeKind = "atividades" | "prova";
export const NOTICE_TEMPLATES: Record<NoticeKind, { name: string; label: string }> = {
  atividades: { name: "aviso_atividades_mes", label: "Atividades do mês" },
  prova: { name: "lembrete_prova", label: "Lembrete de prova" }
};

export interface NoticeInput {
  kind: NoticeKind; date: string; subject?: string; note?: string;
  poloId?: number | null; courseId?: number | null; tutorId?: number | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const withCountry = (n: string): string => {
  const d = String(n || "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};

// what the person typed, checked: the kind, a date from today on, the subject of the test, a short orientation
export const cleanNotice = (b: any): NoticeInput => {
  const kind = b?.kind === "prova" ? "prova" : b?.kind === "atividades" ? "atividades" : null;
  if (!kind) throw new AppError("ERR_NOTICE_KIND", 400);
  const date = String(b?.date || "");
  if (!DAY.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) throw new AppError("ERR_NOTICE_DATE", 400);
  if (date < todayInAppTz()) throw new AppError("ERR_NOTICE_DATE_PAST", 400);
  const subject = cleanParam(b?.subject || "").slice(0, 60);
  if (kind === "prova" && !subject) throw new AppError("ERR_NOTICE_SUBJECT", 400);
  const note = cleanParam(b?.note || "").slice(0, 120).replace(/[.]+$/, "");
  const id = (v: any) => (Number(v) > 0 ? Number(v) : null);
  return { kind, date, subject, note, poloId: id(b?.poloId), courseId: id(b?.courseId), tutorId: id(b?.tutorId) };
};

const brDate = (iso: string): string => iso.split("-").reverse().join("/");

// the value of each {{n}} of the template: the first name and the course come from each student, the rest is typed for the whole send
export const noticeParams = (n: NoticeInput): string[] =>
  n.kind === "prova"
    ? ["primeiro_nome", `=${n.subject}`, "curso", `=${brDate(n.date)}`]
    : ["primeiro_nome", "curso", `=${brDate(n.date)}`, `=${n.note || "acompanhe o portal do aluno"}`];

const templateBody = (kind: NoticeKind): string => (TEMPLATE_PACK("").find(t => t.name === NOTICE_TEMPLATES[kind].name) || { body: "" }).body;

// the enrolled students (not lost) of the filter, one per number; the tutor only ever reaches their own students
const audience = async (n: NoticeInput, tutorOnly: number | null) => {
  const leads = await Lead.findAll({
    where: {
      enrolledAt: { [Op.ne]: null },
      lostAt: null,
      phone: { [Op.ne]: null },
      ...(tutorOnly ? { onboardingTutorId: tutorOnly } : n.tutorId ? { onboardingTutorId: n.tutorId } : {}),
      ...(n.poloId ? { poloId: n.poloId } : {}),
      ...(n.courseId ? { courseId: n.courseId } : {})
    } as any,
    attributes: ["id", "name", "phone", "consentAt"],
    limit: 5000
  });
  const byNumber = new Map<string, { name: string; number: string; phone: string; consentAt: Date | null }>();
  leads.forEach(l => {
    const number = withCountry(l.phone || "");
    if (number.length < 12) return;
    const prev = byNumber.get(number);
    if (!prev) byNumber.set(number, { name: l.name, number, phone: number, consentAt: l.consentAt || null });
    else if (!prev.consentAt && l.consentAt) prev.consentAt = l.consentAt;
  });
  return [...byNumber.values()];
};

export interface NoticePreview {
  kind: NoticeKind; label: string; total: number; canReceive: number; noConsent: number;
  connection: { id: number; name: string; official: boolean } | null;
  template: { name: string; approved: boolean; category: string | null };
  sample: string; cost: CampaignCost | null; blockers: string[];
  // the quota of sends of the month of the person sending (null without a person)
  quota: SendQuota | null;
}

// What would happen if the notice went out now. Nothing is sent or changed.
export const previewNotice = async (n: NoticeInput, tutorOnly: number | null, actorId: number | null = null): Promise<NoticePreview & { people: Awaited<ReturnType<typeof audience>>; whatsapp: Whatsapp | null }> => {
  const [people, whatsapp, allowTemplates, quota] = await Promise.all([
    audience(n, tutorOnly), connectionOfTeam("tutoria"), getSetting("outbound_allow_templates", "false"), actorId ? import("../CampaignServices/SendQuota").then(m => m.quotaOf(actorId)) : Promise.resolve(null)
  ]);
  const consented = people.filter(p => p.consentAt);
  const official = whatsapp?.channel === "whatsapp_cloud";
  const name = NOTICE_TEMPLATES[n.kind].name;
  const blockers: string[] = [];
  let approved = false;
  let category: string | null = null;
  if (!whatsapp) blockers.push("ERR_TUTORIA_NO_NUMBER");
  else if (!official) blockers.push("ERR_NOTICE_NEEDS_OFFICIAL");
  else {
    const list = await approvedTemplates(whatsapp.id).catch(() => [] as Array<{ name: string; category: string }>);
    const found = list.find(t => t.name === name);
    approved = !!found;
    category = found ? String(found.category || "").toUpperCase() : null;
    if (!found) blockers.push("ERR_NOTICE_TEMPLATE_NOT_APPROVED");
    if (allowTemplates !== "true") blockers.push("ERR_TEMPLATES_NOT_AUTHORIZED");
  }
  const cost = whatsapp && official && approved ? await campaignCost({ templateName: name }, whatsapp, consented.length) : null;
  if (cost && cost.category === "MARKETING" && cost.categoryKnown && !cost.marketingAllowed) blockers.push("ERR_CAMPAIGN_MARKETING_BLOCKED");
  if (cost && !cost.fitsMonth) blockers.push("ERR_OUTBOUND_MONTH_BUDGET");
  if (!consented.length) blockers.push("ERR_NOTICE_NO_STUDENTS");
  // past the person's quota of the month: they ask the management for more (Pedir liberação)
  if (quota && quota.limited && consented.length > (quota.left as number)) blockers.push("ERR_SEND_QUOTA");
  const sample = fillTemplate(noticeParams(n), { primeiro_nome: "Maria", curso: "Pedagogia" }, templateBody(n.kind)).text;
  return {
    kind: n.kind, label: NOTICE_TEMPLATES[n.kind].label, total: people.length, canReceive: consented.length, noConsent: people.length - consented.length,
    connection: whatsapp ? { id: whatsapp.id, name: whatsapp.name, official } : null,
    template: { name, approved, category }, sample, cost, blockers, quota, people: consented, whatsapp
  };
};

export const publicPreview = (p: Awaited<ReturnType<typeof previewNotice>>): NoticePreview => {
  const { people, whatsapp, ...rest } = p;
  return rest;
};

// Sends the notice: a list with the students, a campaign of the template on the tutoring number, started at once. Refused with the
// first blocker of the preview, so nothing goes out that the preview would not allow.
export const sendNotice = async (n: NoticeInput, actorId: number, tutorOnly: number | null): Promise<{ campaignId: number; people: number }> => {
  const p = await previewNotice(n, tutorOnly, actorId);
  if (p.blockers.length) throw new AppError(p.blockers[0], ["ERR_OUTBOUND_MONTH_BUDGET", "ERR_CAMPAIGN_MARKETING_BLOCKED", "ERR_SEND_QUOTA"].includes(p.blockers[0]) ? 409 : 400);
  const whatsapp = p.whatsapp as Whatsapp;
  const title = `${p.label} ${brDate(n.date)}${n.kind === "prova" ? ` (${n.subject})` : ""}`;
  const list = await ContactList.create({ name: `Aviso da tutoria: ${title}`, createdById: actorId } as any);
  const { recordLeadCampaignConsent } = await import("../SafetyServices/LeadCampaignConsent");
  for (const person of p.people) await recordLeadCampaignConsent(person); // eslint-disable-line no-await-in-loop
  await ContactListItem.bulkCreate(p.people.map(person => ({ contactListId: list.id, name: person.name, number: person.number })));
  const body = templateBody(n.kind);
  const campaign = await Campaign.create({
    name: `Aviso da tutoria: ${title}`,
    objective: n.kind === "prova" ? `Lembrar os alunos da prova de ${n.subject} em ${brDate(n.date)}` : `Avisar os alunos das atividades do mês (até ${brDate(n.date)})`,
    message: p.sample,
    steps: [{ body: p.sample, mediaUrl: null, delaySec: 0 }],
    whatsappId: whatsapp.id,
    contactListId: list.id,
    templateName: p.template.name,
    templateLanguage: "pt_BR",
    templateParams: JSON.stringify(noticeParams(n)),
    templateBody: body,
    createdById: actorId,
    // the official API has no risk of blocking from the pace: a few seconds between messages is enough
    intervalMin: 2, intervalMax: 6, batchSize: 100, batchPause: 30
  } as any);
  await ensureShippings(campaign);
  await assertCampaignCost(campaign, whatsapp, p.people.length);
  await campaign.update({ status: "running", startedAt: new Date() });
  getIO().emit("campaign", { action: "update", row: campaign });
  return { campaignId: campaign.id, people: p.people.length };
};
