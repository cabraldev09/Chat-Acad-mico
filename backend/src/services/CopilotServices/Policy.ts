import AppError from "../../errors/AppError";

export const CONFIG_KEY = "consultant_copilot";
// The order of a real attendance: right after introducing themselves, the consultant finds out what the person is looking for (the course);
// then whether they already have a degree (it decides the way in: first degree, second degree or transfer); then where they live.
export const DEFAULT_STEPS = [
  ["course", "Curso de interesse", "Descubra o que a pessoa procura e qual curso quer fazer."],
  ["entry", "Já tem graduação?", "Pergunte se já tem faculdade: define primeira graduação, segunda graduação ou transferência."],
  ["city", "Cidade e polo", "Confirme a cidade e o polo de atendimento."],
  ["format", "Formato e duração do curso", "Explique o formato real do curso (regras do MEC) e quanto tempo dura."],
  ["tutoria", "Tutoria", "Conte como a tutoria acompanha o aluno desde a matrícula."],
  ["grade", "Grade do curso", "Envie a grade do curso."],
  ["docentes", "Corpo docente", "Diga que o corpo docente é formado por mestres e doutores."],
  ["bolsa", "Dados para a bolsa", "Peça o nome completo e o CPF para simular a bolsa."],
  ["proposal", "Proposta", "Gere e envie a proposta pelo sistema."],
  ["ficha", "Ficha e documentos", "Envie o link da ficha de matrícula; o lead preenche e manda a foto do documento."],
  ["enroll", "Matrícula", "Taxa paga e comprovante recebido: registre a matrícula com o RGM."]
].map(([key, label, instruction]) => ({ key, label, instruction, message: "", optional: false }));
// the orders shipped before (15 steps): a process still saved like one of them moves to the simple process of 11 steps (25/11/2026); the
// message a manager wrote for a step that stays is kept. A process the manager changed in another way is kept as it is.
export const OLD_DEFAULT_ORDER = ["entry", "objective", "course", "city", "format", "grade", "doubts", "bolsa", "proposal", "ficha", "taxa", "comprovante", "enroll", "comunidade", "afiliado"];
export const FIFTEEN_STEP_ORDER = ["course", "entry", "city", "objective", "format", "grade", "doubts", "bolsa", "proposal", "ficha", "taxa", "comprovante", "enroll", "comunidade", "afiliado"];
export const upgradeSteps = (steps: ProcessStep[]): ProcessStep[] => {
  const order = steps.map(s => s.key).join(",");
  if (order !== OLD_DEFAULT_ORDER.join(",") && order !== FIFTEEN_STEP_ORDER.join(",")) return steps;
  const byKey = new Map(steps.map(s => [s.key, s]));
  return DEFAULT_STEPS.map(d => {
    const saved = byKey.get(d.key);
    return saved && saved.message ? { ...d, message: saved.message } : { ...d };
  });
};
export interface ProcessStep { key: string; label: string; instruction: string; message: string; optional?: boolean }
export interface ConnectionPolicy { enabled: boolean; dailyLimit: number }
export interface CopilotConfig {
  version: number; enabled: boolean; aiEnabled: boolean; agentId: number | null;
  dailyLimit: number; userDailyLimit: number; connectionDailyLimit: number;
  connections: Record<string, ConnectionPolicy>; steps: ProcessStep[];
}
// the AI suggestions are on from the start (tied to the sales process); the manager may turn them off
export const defaultConfig = (): CopilotConfig => ({ version: 1, enabled: true, aiEnabled: true, agentId: null,
  dailyLimit: 100, userDailyLimit: 20, connectionDailyLimit: 50, connections: {}, steps: DEFAULT_STEPS.map(s => ({ ...s })) });
// The enrollment (confirmed by the CRM, never by a checkbox) closes the sale: only the steps that follow it by nature (the tutoring and the community, the referral program) may come after it.
const AFTER_ENROLLMENT = ["comunidade", "afiliado"];
const enrollmentIsLastOf = (steps: ProcessStep[]): boolean => {
  const at = steps.findIndex(s => s.key === "enroll");
  return at >= 0 && steps.slice(at + 1).every(s => AFTER_ENROLLMENT.includes(s.key));
};
const invalid = (): never => { throw new AppError("ERR_COPILOT_CONFIG", 400); };
const integer = (v: any, max = 100000): number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : invalid();
const bool = (v: any): boolean => typeof v === "boolean" ? v : invalid();
const text = (v: any, max: number, required = false): string => typeof v === "string" && v.length <= max && (!required || !!v.trim()) ? v.trim() : invalid();
export const validateConfig = (v: any): CopilotConfig => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  if (!Array.isArray(v.steps) || v.steps.length < 2 || v.steps.length > 20) return invalid();
  const steps: ProcessStep[] = v.steps.map((s: any) => {
    if (!s || !/^[a-z][a-z0-9_]{0,39}$/.test(s.key)) return invalid();
    return { key: s.key, label: text(s.label, 100, true), instruction: text(s.instruction, 800), message: text(s.message, 1500), optional: s.optional === undefined ? false : bool(s.optional) };
  });
  if (new Set(steps.map(s => s.key)).size !== steps.length || !enrollmentIsLastOf(steps)) return invalid();
  if (!v.connections || typeof v.connections !== "object" || Array.isArray(v.connections) || Object.keys(v.connections).length > 500) return invalid();
  const connections: Record<string, ConnectionPolicy> = {};
  for (const [id, rule] of Object.entries(v.connections) as [string, any][]) {
    if (!/^[1-9]\d{0,9}$/.test(id) || !rule) return invalid();
    connections[id] = { enabled: bool(rule.enabled), dailyLimit: integer(rule.dailyLimit) };
  }
  return { version: integer(v.version, 2147483646), enabled: bool(v.enabled), aiEnabled: bool(v.aiEnabled),
    agentId: v.agentId === null ? null : integer(v.agentId, 2147483647) || invalid(), dailyLimit: integer(v.dailyLimit),
    userDailyLimit: integer(v.userDailyLimit), connectionDailyLimit: integer(v.connectionDailyLimit), connections, steps };
};
export const policyFor = (config: CopilotConfig, connectionId: number): ConnectionPolicy => config.connections[String(connectionId)] || { enabled: true, dailyLimit: config.connectionDailyLimit };
// Enrollment is evidence from the CRM. A checklist must never manufacture an enrollment.
export const completionOf = (key: string, detected: boolean, overrides: Record<string, boolean>): boolean => key === "enroll" ? detected : Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : detected;
