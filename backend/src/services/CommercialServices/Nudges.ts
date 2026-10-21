// The two reminders of the AI agent to a lead who stopped answering (pure text: nothing about money, nothing promised). The reminder carries the step
// the conversation owes the lead, so it picks the thread up instead of asking "any doubt?" every time.
export const firstName = (name: string): string => String(name || "").trim().split(/\s+/)[0] || "";

export const nudgeText = (index: number, first: string, course?: string | null, step?: string | null): string => {
  const hi = first ? `Oi, ${first}!` : "Oi!";
  const of = course ? ` de ${course}` : "";
  if (step === "offer_grade" || step === "answer_offer") {
    return index === 0
      ? `${hi} Quer que eu te envie a grade curricular${of}? Nela você vê as disciplinas e o estágio, é só responder "sim".`
      : `${first ? `${first}, passando` : "Passando"} para saber se você ainda quer a grade curricular${of}. Se preferir, chamo o consultor do seu polo para continuar com você.`;
  }
  if (step === "transcript") {
    return index === 0
      ? `${hi} Para eu iniciar a sua análise curricular, preciso do histórico acadêmico em PDF. Quando puder, é só me enviar por aqui.`
      : `${first ? `${first}, passando` : "Passando"} para lembrar do histórico acadêmico em PDF, que é o que falta para a análise curricular. Se preferir, chamo o consultor do seu polo para te ajudar.`;
  }
  if (index === 0) return `${hi} Ficou com alguma dúvida${course ? ` sobre ${course}` : ""}? Consigo te ajudar com o que faltar por aqui.`;
  return `${first ? `${first}, passando` : "Passando"} só para saber se ainda posso te ajudar${course ? ` com ${course}` : ""}. Se preferir, chamo o consultor do seu polo para continuar com você.`;
};
