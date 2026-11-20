import Mustache from "mustache";

import AppError from "../errors/AppError";
import { publicFile } from "./PublicFile";
import { cleanButtons } from "./QuickButtons";

export interface CampaignStep {
  type: "text" | "media";
  body: string;
  mediaUrl: string | null;
  delaySec: number;
  // up to 3 quick-reply buttons under a text message (see QuickButtons)
  buttons?: string[];
}

export const MAX_CAMPAIGN_STEPS = 5;

// {{spin|Olá|Oi|E aí}} picks one option per recipient, so two people rarely get the same text
export const spin = (text: string): string =>
  String(text || "").replace(/\{\{\s*spin\s*\|([^}]*)\}\}/gi, (_m, options: string) => {
    const list = options.split("|").map(o => o.trim()).filter(Boolean);
    return list.length ? list[Math.floor(Math.random() * list.length)] : "";
  });

// {{name}} / {{nome}} the full name, {{primeiro_nome}} / {{first_name}} the first one, {{number}} the phone. The values go out as
// typed (no HTML escaping: it is a WhatsApp text, and "D'Ávila & Cia" must not become "D&#39;Ávila &amp; Cia").
export const renderCampaignText = (text: string, vars: Record<string, string>): string => {
  const name = String(vars.name || "").trim();
  const first = name.split(/\s+/)[0] || "";
  return Mustache.render(spin(text), { ...vars, nome: name, primeiro_nome: first, first_name: first }, {}, { escape: (v: string) => v });
};

// Campaigns created before steps existed only have message/mediaUrl: they become step 1.
export const stepsOf = (c: { steps?: any; message?: string; mediaUrl?: string | null }): CampaignStep[] => {
  if (Array.isArray(c.steps) && c.steps.length) return c.steps as CampaignStep[];
  return [{ type: c.mediaUrl ? "media" : "text", body: c.message || "", mediaUrl: c.mediaUrl || null, delaySec: 0 }];
};

// the messages of a sequence (campaign or scheduled message), checked: up to 5, each with a text or a file, and the wait before the next one
export const cleanSteps = (raw: any): CampaignStep[] => {
  if (!Array.isArray(raw)) throw new AppError("ERR_CAMPAIGN_NO_MESSAGE");
  if (raw.length > MAX_CAMPAIGN_STEPS) throw new AppError("ERR_CAMPAIGN_TOO_MANY_STEPS");
  const out = raw.map((s: any) => {
    const body = String(s?.body || "").trim().slice(0, 4000);
    const mediaUrl = s?.mediaUrl ? String(s.mediaUrl) : null;
    if (mediaUrl) publicFile(mediaUrl);
    if (!body && !mediaUrl) throw new AppError("ERR_CAMPAIGN_STEP_EMPTY");
    const delaySec = Math.min(600, Math.max(0, Math.round(Number(s?.delaySec) || 0)));
    const buttons = mediaUrl ? [] : cleanButtons(s?.buttons);
    return { type: mediaUrl ? "media" : "text", body, mediaUrl, delaySec, ...(buttons.length ? { buttons } : {}) } as CampaignStep;
  });
  if (!out.length) throw new AppError("ERR_CAMPAIGN_NO_MESSAGE");
  return out;
};
