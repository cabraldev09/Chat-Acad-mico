// The steps the tutor ticks while getting the student started. Concluding the onboarding with a step left asks for the reason.
export const CHECKLIST = [
  { key: "first_access", label: "Primeiro acesso à plataforma" },
  { key: "ava", label: "Ambiente virtual (AVA) apresentado" },
  { key: "polo_contacts", label: "Contatos do polo e da tutoria passados" },
  { key: "documents", label: "Documentos da matrícula conferidos" },
  { key: "access", label: "Acesso enviado (RGM, e-mail acadêmico e portal)" }
] as const;

export const parseChecklist = (raw: string | null | undefined): Record<string, string> => {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (_) {
    return {};
  }
};

// the steps still not ticked
export const missingSteps = (raw: string | null | undefined): Array<{ key: string; label: string }> => {
  const done = parseChecklist(raw);
  return CHECKLIST.filter(s => !done[s.key]);
};
