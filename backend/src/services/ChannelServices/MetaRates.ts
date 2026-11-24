// How the Meta charges the official API (Configurações → Custos → Meta). Reference values for recipients in Brazil, in US$ per delivered
// template message, from the public rate list of the date below; the real spending always comes from the Meta (pricing analytics).
export const META_RATES_DATE = "2026-11";
export const META_RATES_BR: { category: string; label: string; usd: number; note: string }[] = [
  { category: "MARKETING", label: "Marketing", usd: 0.0625, note: "Promoções, campanhas e convites. Cobrado sempre, mesmo dentro da janela de 24 h." },
  { category: "UTILITY", label: "Utilidade", usd: 0.0068, note: "Avisos de algo já combinado (matrícula, boleto, prazo, atividade, prova)." },
  { category: "AUTHENTICATION", label: "Autenticação", usd: 0.0068, note: "Códigos de acesso." }
];
export const META_RULES = [
  "A Meta cobra por mensagem entregue, conforme a categoria do modelo.",
  "Marketing custa cerca de 9 vezes mais que Utilidade: avisos devem ser sempre de Utilidade.",
  "Responder dentro de 24 h da última mensagem da pessoa (atendimento) não precisa de modelo. Cada número oficial tem 1.000 respostas grátis por mês; acima disso, cada resposta é cobrada.",
  "Fora da janela, só sai mensagem por modelo aprovado, e ele é cobrado pela categoria.",
  "O custo é por mensagem, não por número: ter um número a mais não encarece e traz mais 1.000 respostas grátis."
];

// the free answers (service messages) each official number has per month
export const FREE_SERVICE_PER_NUMBER = 1000;
export type SendCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION" | "SERVICE";
export const tableRate = (category: string): number => (META_RATES_BR.find(r => r.category === category) || META_RATES_BR[0]).usd;
const typed = (raw: string | null | undefined): number | null => (raw !== undefined && raw !== null && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null);

// What one message is estimated to cost (US$), by its category. A template whose category is not known is counted as Marketing (the
// most expensive), so a cap is never passed by mistake. A typed price (Operação e custos) replaces the table: the template price
// counts for Utility and Authentication, the answer price for the answers after the free ones (without it, the Utility price).
export const estimateSendUsd = (o: {
  channel: string; category: SendCategory; serviceUsedThisMonth?: number; templateUsd?: string | null; serviceUsd?: string | null;
}): number | null => {
  if (o.channel !== "whatsapp_cloud") return ["instagram", "messenger"].includes(o.channel) ? 0 : null;
  if (o.category === "SERVICE") {
    if ((o.serviceUsedThisMonth || 0) < FREE_SERVICE_PER_NUMBER) return 0;
    return typed(o.serviceUsd) ?? typed(o.templateUsd) ?? tableRate("UTILITY");
  }
  if (o.category === "MARKETING") return tableRate("MARKETING");
  return typed(o.templateUsd) ?? tableRate(o.category);
};

// the cost of sending one template to many people, for the preview before a send
export const estimateBatchUsd = (people: number, category: string, templateUsd?: string | null): number =>
  Math.round(people * (estimateSendUsd({ channel: "whatsapp_cloud", category: (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category) ? category : "MARKETING") as SendCategory, templateUsd }) || 0) * 10000) / 10000;
