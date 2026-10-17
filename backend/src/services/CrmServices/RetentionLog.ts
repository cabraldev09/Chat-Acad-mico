import Lead from "../../models/Lead";
import RetentionMessage from "../../models/RetentionMessage";
import { logger } from "../../utils/logger";

// Every message the retention area sends is written down: what it said, to whom, by whom and whether it left. The log of
// "Envios" and the numbers of the operation read it. A failure to write the log never stops the message.
export type RetentionKind = "nps" | "risk" | "remat" | "custom";

export const logRetention = async (o: {
  lead: Lead;
  contactId?: number | null;
  kind: RetentionKind;
  body: string;
  userId?: number | null;
  surveyId?: number | null;
  error?: string | null;
  withButtons?: boolean;
}): Promise<void> => {
  try {
    await RetentionMessage.create({
      leadId: o.lead.id,
      contactId: o.contactId || o.lead.contactId || null,
      kind: o.kind,
      body: String(o.body || "").slice(0, 4000),
      userId: o.userId || null,
      surveyId: o.surveyId || null,
      status: o.error ? "failed" : "sent",
      error: o.error ? String(o.error).slice(0, 400) : null,
      withButtons: !!o.withButtons
    } as any);
  } catch (err) {
    logger.warn(`Retention log not written: ${(err as Error).message}`);
  }
};

// "{{nome}}" is the first name of the student; "{{periodo}}" the re-enrollment term
export const renderRetentionText = (text: string, name: string, extra: Record<string, string> = {}): string =>
  Object.entries({ nome: (name || "").trim().split(/\s+/)[0] || "", ...extra }).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v),
    text
  );
