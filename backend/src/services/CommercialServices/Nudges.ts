// The two reminders of the AI agent to a lead who stopped answering (pure text: nothing about money, nothing promised)
export const firstName = (name: string): string => String(name || "").trim().split(/\s+/)[0] || "";

export const nudgeText = (index: number, first: string, course?: string | null): string => {
  const hi = first ? `Oi, ${first}!` : "Oi!";
  if (index === 0) return `${hi} Ficou com alguma dúvida${course ? ` sobre ${course}` : ""}? Consigo te ajudar com o que faltar por aqui.`;
  return `${first ? `${first}, passando` : "Passando"} só para saber se ainda posso te ajudar${course ? ` com ${course}` : ""}. Se preferir, chamo o consultor do seu polo para continuar com você.`;
};

