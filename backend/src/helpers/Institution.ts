import { AsyncLocalStorage } from "async_hooks";

import { getSetting } from "./AppSettings";

// The universities of the group. One is the default (isDefault): everything that does not say another one belongs to it. A conversation
// takes the university of the number it came through; a lead, the one of its conversation (or of the form / affiliate link). The texts,
// the brand and the settings follow the university of the conversation, falling back to the default one and to the global settings.

// The name the assistant speaks for when nothing says otherwise (Configurações → Geral): kept in memory (loaded at start, refreshed on save)
export const DEFAULT_INSTITUTION = "Cruzeiro do Sul Virtual";
let cached = DEFAULT_INSTITUTION;
// inside the work of one conversation (withInstitutionOf), the name is the one of the university of that conversation: every text and
// prompt that says institutionName() follows it with no change of its own
const scope = new AsyncLocalStorage<string>();
export const institutionName = (): string => scope.getStore() || cached;
export const setInstitution = (value: string | null | undefined): void => {
  cached = String(value || "").replace(/\s+/g, " ").trim().slice(0, 80) || DEFAULT_INSTITUTION;
};
export const loadInstitution = async (): Promise<void> => setInstitution(await getSetting("institution_name", DEFAULT_INSTITUTION));

// ------------------------------------------------------------------ the universities in memory (a few seconds; cleared on every change)
const TTL = 30000;
const memo = new Map<string, { at: number; value: any }>();
const remember = async <T>(key: string, compute: () => Promise<T>): Promise<T> => {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await compute();
  memo.set(key, { at: Date.now(), value });
  return value;
};
export const forgetInstitutions = (): void => memo.clear();

export interface InstitutionView { id: number; name: string; shortName: string | null; slug: string | null; brandColor: string | null; site: string | null; mailFromName: string | null; mailFrom: string | null; footer: string | null; logoFile: string | null; isDefault: boolean; active: boolean }

const view = (row: any): InstitutionView | null => (row ? {
  id: row.id, name: row.name, shortName: row.shortName || null, slug: row.slug || null, brandColor: row.brandColor || null, site: row.site || null,
  mailFromName: row.mailFromName || null, mailFrom: row.mailFrom || null, footer: row.footer || null, logoFile: row.logoFile || null,
  isDefault: !!row.isDefault, active: row.active !== false
} : null);

export const allInstitutions = (): Promise<InstitutionView[]> => remember("all", async () => {
  const Institution = (await import("../models/Institution")).default;
  return (await Institution.findAll({ order: [["isDefault", "DESC"], ["name", "ASC"]] })).map(r => view(r) as InstitutionView);
});

export const defaultInstitution = async (): Promise<InstitutionView | null> => {
  const list = await allInstitutions();
  return list.find(i => i.isDefault) || list[0] || null;
};

export const institutionById = async (id?: number | null): Promise<InstitutionView | null> => {
  const list = await allInstitutions();
  return (id ? list.find(i => i.id === Number(id)) : null) || (await defaultInstitution());
};

export const institutionBySlug = async (slug?: string | null): Promise<InstitutionView | null> => {
  const s = String(slug || "").toLowerCase();
  return (await allInstitutions()).find(i => i.slug === s) || null;
};

// the university of a number (its own, or the default)
export const institutionIdForWhatsapp = async (whatsappId?: number | null): Promise<number | null> => {
  const own = whatsappId ? await remember(`wa:${whatsappId}`, async () => {
    const Whatsapp = (await import("../models/Whatsapp")).default;
    return (await Whatsapp.findByPk(whatsappId, { attributes: ["id", "institutionId"] }))?.institutionId || null;
  }) : null;
  return own || (await defaultInstitution())?.id || null;
};

// the university of a contact: the one of its latest conversation (else the default)
export const institutionIdForContact = async (contactId?: number | null): Promise<number | null> => {
  if (contactId) {
    const Ticket = (await import("../models/Ticket")).default;
    const t = await Ticket.findOne({ where: { contactId } as any, attributes: ["institutionId", "whatsappId"], order: [["id", "DESC"]] });
    if (t?.institutionId) return t.institutionId;
    if (t?.whatsappId) return institutionIdForWhatsapp(t.whatsappId);
  }
  return (await defaultInstitution())?.id || null;
};

// the university of what is being talked about (a conversation, a lead), for the texts and the brand
export const institutionFor = async (ctx: { institutionId?: number | null; ticket?: any; ticketId?: number | null; lead?: any; leadId?: number | null } = {}): Promise<InstitutionView | null> => {
  let id = ctx.institutionId || ctx.ticket?.institutionId || ctx.lead?.institutionId || null;
  if (!id && ctx.ticketId) {
    const Ticket = (await import("../models/Ticket")).default;
    id = (await Ticket.findByPk(ctx.ticketId, { attributes: ["institutionId"] }))?.institutionId || null;
  }
  if (!id && ctx.leadId) {
    const Lead = (await import("../models/Lead")).default;
    id = (await Lead.findByPk(ctx.leadId, { attributes: ["institutionId"] }))?.institutionId || null;
  }
  return institutionById(id);
};

// the name to speak for in a conversation: the short name of its university, else its name; with one university only (or the default
// one), the name of Configurações → Geral (what the team already typed)
export const institutionNameFor = async (ctx: Parameters<typeof institutionFor>[0] = {}): Promise<string> => {
  const list = await allInstitutions();
  if (list.length <= 1) return cached;
  const inst = await institutionFor(ctx);
  if (!inst || inst.isDefault) return cached;
  return inst.shortName || inst.name || cached;
};

// a setting as the university of the conversation has it (InstitutionSettings), else the global one
export const getSettingFor = async (key: string, institutionId: number | null | undefined, fallback = ""): Promise<string> => {
  if (institutionId) {
    const own = await remember(`set:${institutionId}:${key}`, async () => {
      const InstitutionSetting = (await import("../models/InstitutionSetting")).default;
      const row = await InstitutionSetting.findOne({ where: { institutionId, key } as any });
      return row && row.value !== null && row.value !== "" ? row.value : null;
    });
    if (own !== null) return own;
  }
  return getSetting(key, fallback);
};

// runs the work of one conversation (an AI turn, a flow, the copilot) speaking for the university of that conversation
export const withInstitutionOf = async <T>(ctx: Parameters<typeof institutionFor>[0], fn: () => Promise<T>): Promise<T> => {
  let name: string;
  try { name = await institutionNameFor(ctx); } catch (_) { name = cached; }
  return scope.run(name || cached, fn);
};
