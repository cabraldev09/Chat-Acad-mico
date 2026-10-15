export const ROLES = ["admin", "coordenacao", "consultor", "tutor", "academico"] as const;
export type Role = typeof ROLES[number];

// administrators and coordinators see and manage everything in every polo
export const isManagerRole = (role: string | undefined): boolean => role === "admin" || role === "coordenacao";

// which side a coordinator coordinates (a label: it does not limit access)
export const COORD_AREAS = ["comercial", "academica"] as const;

// the tutor IS the academic sector: one function covers the first access and the academic life of the student
export const POLO_FUNCTIONS = ["comercial", "tutoria", "coordenacao"] as const;
export type PoloFunction = typeof POLO_FUNCTIONS[number];

// queue function that belongs to each job role
export const QUEUE_ROLE_OF: Record<string, PoloFunction | null> = {
  consultor: "comercial",
  tutor: "tutoria",
  academico: "tutoria",
  coordenacao: "coordenacao",
  admin: null
};

// conversation segment each role may work on
export const SEGMENTS_OF: Record<string, string[]> = {
  consultor: ["sales", "postsale"],
  tutor: ["onboarding", "support"],
  academico: ["onboarding", "support"],
  coordenacao: ["sales", "postsale", "onboarding", "support"],
  admin: ["sales", "postsale", "onboarding", "support"]
};

// users created before roles existed carry only `profile`
// the administrator profile always wins: it is what the permission checks and the
// seeded admin user rely on
export const roleOf = (u: { role?: string; profile?: string }): Role =>
  u.profile === "admin"
    ? "admin"
    : ((u.role === "academico" ? "tutor" : u.role && (ROLES as readonly string[]).includes(u.role) ? u.role : "consultor") as Role);

export const POLO_FUNCTION_LABEL: Record<PoloFunction, string> = {
  comercial: "Comercial",
  tutoria: "Tutoria",
  coordenacao: "Coordenação"
};
