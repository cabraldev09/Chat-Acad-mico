import Mustache from "mustache";

export interface CampaignStep {
  type: "text" | "media";
  body: string;
  mediaUrl: string | null;
  delaySec: number;
}

export const MAX_CAMPAIGN_STEPS = 5;

// {{spin|Olá|Oi|E aí}} picks one option per recipient, so two people rarely get the same text
export const spin = (text: string): string =>
  String(text || "").replace(/\{\{\s*spin\s*\|([^}]*)\}\}/gi, (_m, options: string) => {
    const list = options.split("|").map(o => o.trim()).filter(Boolean);
    return list.length ? list[Math.floor(Math.random() * list.length)] : "";
  });

export const renderCampaignText = (text: string, vars: Record<string, string>): string =>
  Mustache.render(spin(text), vars);

// Campaigns created before steps existed only have message/mediaUrl: they become step 1.
export const stepsOf = (c: { steps?: any; message?: string; mediaUrl?: string | null }): CampaignStep[] => {
  if (Array.isArray(c.steps) && c.steps.length) return c.steps as CampaignStep[];
  return [{ type: c.mediaUrl ? "media" : "text", body: c.message || "", mediaUrl: c.mediaUrl || null, delaySec: 0 }];
};
