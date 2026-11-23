import { Op } from "sequelize";
import Lead from "../../models/Lead";
import Polo from "../../models/Polo";
import PoloMember from "../../models/PoloMember";
import User from "../../models/User";
import { addActivity } from "../CrmServices/LeadCore";
import { resolvePoloFor } from "./ResolvePolo";

// THE POLO OF A LEAD. One rule, in this order:
//   1. the person told the city (or the state): the polo that serves it, adjusted by the course (a semipresencial course enrolls only at
//      the released polos). A city nobody serves, or one that fits more than one polo, leaves the lead WITHOUT a polo (the agent asks,
//      the reserve queue answers): the wallet is never used to guess it;
//   2. no city and no state: the wallet, that is, the commercial polo of the consultant who owns the lead, when it is a single one;
//   3. the city told later replaces the polo of the wallet.
// A polo the person chose inside a flow and the polo of an enrolled student are never changed here.
export type PoloSource = "city" | "wallet" | "flow" | "enrollment";

export interface PoloRuleInput {
  // a city or a state was told
  hasPlace: boolean;
  // the single polo the place points to (null: nobody serves it, or more than one fits)
  placePoloId: number | null;
  // the active commercial polos of the owner of the lead
  walletPoloIds: number[];
}

export const pickPoloRule = (i: PoloRuleInput): { poloId: number | null; source: "city" | "wallet" | null } => {
  if (i.hasPlace) return i.placePoloId ? { poloId: i.placePoloId, source: "city" } : { poloId: null, source: null };
  const wallet = Array.from(new Set(i.walletPoloIds.filter(Boolean)));
  return wallet.length === 1 ? { poloId: wallet[0], source: "wallet" } : { poloId: null, source: null };
};

// the lead keeps the polo it has: enrolled, chosen in a flow, or already decided by the city (unless the caller says the place changed)
export const keepsPolo = (lead: { poloId?: number | null; poloSource?: string | null; enrolledAt?: Date | null }, placeChanged = false): boolean => {
  if (lead.enrolledAt || lead.poloSource === "flow" || lead.poloSource === "enrollment") return true;
  if (!lead.poloId || lead.poloSource === "wallet") return false;
  return !placeChanged;
};

export const walletPolosOf = async (ownerId: number | null | undefined): Promise<number[]> => {
  if (!ownerId) return [];
  const ids = (await PoloMember.findAll({ where: { userId: ownerId, role: "comercial" }, attributes: ["poloId"] })).map(m => Number(m.poloId));
  if (!ids.length) return [];
  return (await Polo.findAll({ where: { id: { [Op.in]: ids }, active: true }, attributes: ["id"] })).map(p => p.id);
};

export interface SettledPolo {
  // where the lead is (the enrollment polo when the course is semipresencial)
  polo: Polo | null;
  // the polo of the city itself, when the rule used the city
  cityPolo: Polo | null;
  source: PoloSource | null;
  changed: boolean;
}

export interface SettleOptions {
  // what the conversation knows and the lead may not have saved yet
  cityHint?: string | null;
  stateHint?: string | null;
  // the city or the state of the lead was just edited: a polo decided by the old city is decided again
  placeChanged?: boolean;
}

export const settleLeadPolo = async (lead: Lead | null, opts: SettleOptions = {}): Promise<SettledPolo> => {
  if (!lead) return { polo: null, cityPolo: null, source: null, changed: false };
  const current = lead.poloId ? await Polo.findByPk(lead.poloId) : null;
  const usable = current && current.active !== false ? current : null;
  if (usable && keepsPolo(lead, opts.placeChanged)) return { polo: usable, cityPolo: null, source: (lead.poloSource as PoloSource) || null, changed: false };
  // an enrolled student or a choice made in a flow whose polo was closed: nothing is guessed in its place
  if (lead.enrolledAt || lead.poloSource === "flow" || lead.poloSource === "enrollment") return { polo: usable, cityPolo: null, source: (lead.poloSource as PoloSource) || null, changed: false };

  const city = String(opts.cityHint || lead.city || "").trim();
  const state = String(opts.stateHint || lead.state || "").trim();
  const hasPlace = !!(city || state);
  const found = hasPlace ? await resolvePoloFor(city, state) : null;
  const placePolo = found && found.status === "found" ? found.polo : null;
  const rule = pickPoloRule({ hasPlace, placePoloId: placePolo ? placePolo.id : null, walletPoloIds: hasPlace ? [] : await walletPolosOf(lead.ownerId) });

  let polo: Polo | null = null;
  let practiceId: number | null = null;
  if (rule.source === "city" && placePolo) {
    const { enrollmentPoloFor } = await import("../CommercialServices/Router");
    const r = await enrollmentPoloFor(lead, placePolo);
    polo = r.polo;
    practiceId = r.cityPolo ? r.cityPolo.id : null;
  } else if (rule.poloId) polo = await Polo.findByPk(rule.poloId);

  const nextId = polo ? polo.id : null;
  const source: PoloSource | null = polo ? rule.source : null;
  const changed = (lead.poloId || null) !== nextId || (lead.practicePoloId || null) !== practiceId || (lead.poloSource || null) !== source;
  if (changed) {
    const before = lead.poloId || null;
    await lead.update({ poloId: nextId, practicePoloId: practiceId, poloSource: source } as any);
    if (before !== nextId) {
      const owner = source === "wallet" && lead.ownerId ? await User.findByPk(lead.ownerId, { attributes: ["name"] }) : null;
      const text = !polo
        ? "Polo retirado: a cidade informada não tem um polo definido."
        : source === "wallet"
          ? `Polo definido pela carteira${owner ? ` de ${owner.name}` : ""}: ${polo.name}`
          : `Polo definido pela cidade informada: ${polo.name}`;
      await addActivity(lead.id, null, "system", text).catch(() => undefined);
    }
  }
  return { polo, cityPolo: placePolo, source, changed };
};

// The course of the lead changed and its polo came from the city: a semipresencial course enrolls at a released polo, any other at the
// polo of the city itself. The city is not read again (the polo of the city is the one already saved).
export const refreshCoursePolo = async (lead: Lead | null): Promise<void> => {
  if (!lead || !lead.poloId || lead.enrolledAt || lead.poloSource === "flow" || lead.poloSource === "enrollment" || lead.poloSource === "wallet") return;
  const cityPolo = await Polo.findByPk(lead.practicePoloId || lead.poloId);
  if (!cityPolo || cityPolo.active === false) return;
  const { enrollmentPoloFor } = await import("../CommercialServices/Router");
  const r = await enrollmentPoloFor(lead, cityPolo);
  const practiceId = r.cityPolo ? r.cityPolo.id : null;
  if (lead.poloId === r.polo.id && (lead.practicePoloId || null) === practiceId) return;
  await lead.update({ poloId: r.polo.id, practicePoloId: practiceId } as any);
  await addActivity(lead.id, null, "system", r.cityPolo ? `Curso semipresencial: a matrícula é no polo ${r.polo.name}. O polo da cidade é ${r.cityPolo.name}.` : `Polo definido pela cidade informada: ${r.polo.name}`).catch(() => undefined);
};
