import type { Routed } from "./Router";

// What the lead is told after the handoff when it happened outside the working hours (said once, by the caller)
export const afterHoursNotice = (r: Routed): string | null => {
  const parts: string[] = [];
  // no promise about the practical classes: they are being worked out
  if (r.semipresencial) parts.push(`Como esse curso é semipresencial, a matrícula é feita no polo de ${poloLabel(r.semipresencial.enrollPolo)}. Estamos trabalhando para que as aulas práticas aconteçam no polo mais perto de você, e o consultor te explica como fica no seu caso.`);
  if (!r.within && r.whenText) parts.push(`Nossa equipe retorna ${r.whenText}. Pode deixar sua mensagem aqui que ela já fica para o consultor.`);
  return parts.length ? parts.join(" ") : null;
};

// The one thing said after the handoff: the semipresencial rule, the working hours, or that the lead waits in the queue (never "a consultant took it" before
// the backend confirmed who did). The administrator can write the queue and the after-hours messages; {{quando}} and {{polo}} are filled in.
export const afterHandoffNotice = (r: Routed, messages?: { queued?: string; afterHours?: string } | null): string | null => {
  const fill = (t: string): string => t.replace(/\{\{\s*quando\s*\}\}/gi, r.whenText || "").replace(/\{\{\s*polo\s*\}\}/gi, r.poloName ? poloLabel(r.poloName) : "nosso polo");
  const base = afterHoursNotice(r);
  if (!r.within) return messages && messages.afterHours ? fill(messages.afterHours) : base;
  if (!r.userId && r.queueId) {
    const queued = messages && messages.queued ? fill(messages.queued) : `Seu atendimento já está na fila ${r.poloName ? `do polo ${poloLabel(r.poloName)}` : "da nossa equipe"}. Assim que um consultor estiver disponível, ele continua com você por aqui.`;
    return [base, queued].filter(Boolean).join(" ");
  }
  return base;
};

// "Porto Velho - Centro - RO" is said "Porto Velho"
export const poloLabel = (name: string): string => String(name || "").replace(/\s*[-(].*$/, "").trim() || name;


