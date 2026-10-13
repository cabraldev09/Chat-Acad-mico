export const ROLES = ["admin", "coordenacao", "consultor", "tutor", "academico"] as const;
export type Role = typeof ROLES[number];

export const POLO_FUNCTIONS = ["comercial", "tutoria", "academico", "coordenacao"] as const;
export type PoloFunction = typeof POLO_FUNCTIONS[number];

// queue function that belongs to each job role
export const QUEUE_ROLE_OF: Record<string, PoloFunction | null> = {
  consultor: "comercial",
  tutor: "tutoria",
  academico: "academico",
  coordenacao: "coordenacao",
  admin: null
};

// conversation segment each role may work on
export const SEGMENTS_OF: Record<string, string[]> = {
  consultor: ["sales", "postsale"],
  tutor: ["onboarding"],
  academico: ["support"],
  coordenacao: ["sales", "postsale", "onboarding", "support"],
  admin: ["sales", "postsale", "onboarding", "support"]
};

// users created before roles existed carry only `profile`
// the administrator profile always wins: it is what the permission checks and the
// seeded admin user rely on
export const roleOf = (u: { role?: string; profile?: string }): Role =>
  u.profile === "admin"
    ? "admin"
    : ((u.role && (ROLES as readonly string[]).includes(u.role) ? u.role : "consultor") as Role);

export const POLO_FUNCTION_LABEL: Record<PoloFunction, string> = {
  comercial: "Comercial",
  tutoria: "Tutoria",
  academico: "Acadêmico",
  coordenacao: "Coordenação"
};
