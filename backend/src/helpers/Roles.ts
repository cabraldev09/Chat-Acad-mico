export const ROLES = ["admin", "coordenacao", "consultor", "tutor", "academico", "relacionamento"] as const;
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
  relacionamento: null,
  admin: null
};

// The relationship department: the institution's own number for after-sales (satisfaction survey, retention, re-enrollment).
// One queue for the whole institution (not one per polo), and its conversations have their own segment.
export const RELATIONSHIP_SEGMENT = "relationship";
export const RELATIONSHIP_QUEUE_ROLE = "relacionamento";
export const RELATIONSHIP_QUEUE_NAME = "Relacionamento";

// conversation segment each role may work on
export const SEGMENTS_OF: Record<string, string[]> = {
  consultor: ["sales", "postsale"],
  tutor: ["onboarding", "support"],
  academico: ["onboarding", "support"],
  relacionamento: [RELATIONSHIP_SEGMENT],
  coordenacao: ["sales", "postsale", "onboarding", "support", RELATIONSHIP_SEGMENT],
  admin: ["sales", "postsale", "onboarding", "support", RELATIONSHIP_SEGMENT]
};

// The retention area (satisfaction survey, students at risk, re-enrollment, messages and the number of the relationship
// department) belongs to the maintainer (the administrator) and to the academic coordinator. Tutors and the other roles do not
// operate it: they only attend the conversations.
export const canOperateRetention = (u: { role?: string; profile?: string; coordArea?: string | null } | undefined): boolean => {
  if (!u) return false;
  const role = u.profile === "admin" ? "admin" : u.role;
  return role === "admin" || (role === "coordenacao" && u.coordArea === "academica");
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
