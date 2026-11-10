// Pure policy functions shared by the live agent, tester and reminder worker.
export const boundedInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return value === undefined || value === null || value === "" || !Number.isFinite(n)
    ? fallback : Math.min(max, Math.max(min, Math.floor(n)));
};

export const policyOf = (persona: any = {}) => ({
  guideSale: persona?.guideSale !== false,
  readyAnswers: persona?.readyAnswers === true,
  simulateScholarship: persona?.simulateScholarship === true,
  followUp: {
    enabled: persona?.followUp?.enabled === true,
    minutes: boundedInt(persona?.followUp?.minutes, 30, 5, 1380),
    message: String(persona?.followUp?.message || "Posso continuar te ajudando com sua matrícula?").trim().slice(0, 600)
      || "Posso continuar te ajudando com sua matrícula?"
  }
});

const normalize = (text: string) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.!?]+$/g, "").trim();

export const wantsToStop = (text: string): boolean =>
  /^(pare|parar|stop|sair|cancelar|nao tenho interesse|sem interesse|nao quero|nao me chame mais|nao me mande mais mensagens)$/.test(normalize(text)) ||
  /\b(nao (?:quero|desejo) (?:mais )?(?:receber|que (?:me )?(?:mande|envie))|pare de (?:me )?(?:mandar|enviar))\b/.test(normalize(text));

export const nextQuestion = (missing: Array<{ key: string; label: string }>): string => {
  const slot = missing[0];
  if (!slot) return "Quer que um consultor prepare sua proposta de matrícula?";
  const questions: Record<string, string> = {
    nome: "Como posso te chamar?", cidade: "Em qual cidade você quer estudar?",
    curso: "Qual curso você quer fazer?", modalidade: "Você prefere EAD ou semipresencial?",
    forma_ingresso: "Você vai ingressar pelo vestibular, ENEM, transferência ou segunda graduação?"
  };
  return questions[slot.key] || `Pode me informar ${slot.label.toLowerCase()}?`;
};

export const withNextStep = (text: string, missing: Array<{ key: string; label: string }>, enabled: boolean): string => {
  const clean = text.trim();
  if (!clean || !enabled || clean.includes("?") || /\[(HANDOFF|DESCONHECIDO)\]/.test(clean)) return clean;
  return `${clean}\n\n${nextQuestion(missing)}`;
};

export const usageCounts = (u: any = {}) => {
  const cacheRead = u.cache_read_input_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return {
    // Anthropic input_tokens excludes cache reads/writes; OpenAI prompt_tokens includes them.
    input: u.prompt_tokens ?? ((u.input_tokens || 0) + cacheRead + cacheWrite),
    output: u.output_tokens ?? u.completion_tokens ?? 0,
    cacheRead, cacheWrite
  };
};

export const reminderIsDue = (p: {
  enabled: boolean; minutes: number; now: number; lastInbound: number; lastOutbound: number;
  reminded: boolean; active: boolean; assigned: boolean; closed: boolean; optedOut: boolean;
}): boolean => p.enabled && p.active && !p.assigned && !p.closed && !p.optedOut && !p.reminded &&
  p.lastInbound > 0 && p.lastOutbound >= p.lastInbound && p.lastOutbound <= p.now &&
  p.now - p.lastOutbound >= p.minutes * 60000 && p.now - p.lastInbound < 23 * 3600000;
