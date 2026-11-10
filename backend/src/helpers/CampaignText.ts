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
