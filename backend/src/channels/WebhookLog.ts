// What the Meta last did at the webhook of each connection, kept in memory (one server): when it called and what became of it. It answers "the message
// did not arrive" without anyone reading the server log: no call at all (the Meta is not sending), a call refused (secret or token) or a call for
// another number.
export interface WebhookNote {
  at: number;
  outcome: "recebido" | "assinatura_invalida" | "sem_app_secret" | "numero_diferente" | "verificacao_ok" | "verificacao_recusada";
  detail?: string;
  messages: number;
}

const notes = new Map<number, WebhookNote>();

export const noteWebhook = (whatsappId: number, outcome: WebhookNote["outcome"], detail?: string, messages = 0): void => {
  notes.set(Number(whatsappId), { at: Date.now(), outcome, detail, messages });
};

export const lastWebhook = (whatsappId: number): WebhookNote | null => notes.get(Number(whatsappId)) || null;

// "1 mensagem", "2 mensagens e 1 aviso de entrega": what a delivery of the Cloud API carries
export const describeCloudBody = (body: any): { text: string; messages: number } => {
  let messages = 0;
  let statuses = 0;
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      messages += (change.value?.messages || []).length;
      statuses += (change.value?.statuses || []).length;
    }
  }
  const parts: string[] = [];
  if (messages) parts.push(`${messages} mensage${messages === 1 ? "m" : "ns"}`);
  if (statuses) parts.push(`${statuses} aviso${statuses === 1 ? "" : "s"} de entrega`);
  return { text: parts.join(" e ") || "sem mensagens", messages };
};
