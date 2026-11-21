// How the Meta charges the official API (Configurações → Custos → Meta). Reference values for recipients in Brazil, in US$ per delivered
// template message, from the public rate list of the date below; the real spending always comes from the Meta (pricing analytics).
export const META_RATES_DATE = "2026-11";
export const META_RATES_BR: { category: string; label: string; usd: number; note: string }[] = [
  { category: "MARKETING", label: "Marketing", usd: 0.0625, note: "Promoções, campanhas e convites. Cobrado sempre, mesmo dentro da janela de 24 h." },
  { category: "UTILITY", label: "Utilidade", usd: 0.0068, note: "Avisos de algo já combinado (matrícula, boleto, prazo). Gratuito dentro da janela de 24 h." },
  { category: "AUTHENTICATION", label: "Autenticação", usd: 0.0068, note: "Códigos de acesso." }
];
export const META_RULES = [
  "A Meta cobra por modelo entregue, conforme a categoria do modelo.",
  "Responder dentro de 24 h da última mensagem da pessoa (atendimento) é gratuito, sem modelo.",
  "Um modelo de Utilidade enviado dentro dessa janela também é gratuito.",
  "Fora da janela, só sai mensagem por modelo aprovado, e ele é cobrado pela categoria."
];
