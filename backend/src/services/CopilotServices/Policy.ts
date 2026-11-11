import AppError from "../../errors/AppError";

export const CONFIG_KEY = "consultant_copilot";
export const DEFAULT_STEPS = [
  ["entry", "Forma de ingresso", "Identifique se é primeira graduação, transferência ou segunda graduação."],
  ["objective", "Objetivo com a graduação", "Pergunte o objetivo (concurso, carreira, formação superior) para orientar sem indicar fora dele."],
  ["course", "Curso de interesse", "Confirme o curso que a pessoa deseja estudar."],
  ["city", "Cidade e polo", "Confirme a cidade e o polo de atendimento."],
  ["format", "Formato e regras do MEC", "Explique o formato real do curso e confirme que a pessoa compreendeu."],
  ["grade", "Grade, tutoria e estágio", "Apresente a grade do curso, a tutoria e as informações de estágio."],
  ["doubts", "Dúvidas e objeções", "Responda às dúvidas antes de apresentar a proposta."],
  ["bolsa", "Dados para a bolsa", "Solicite somente os dados necessários para simular a bolsa."],
  ["proposal", "Apresentação da proposta", "Confira os valores e condições reais antes de apresentar a proposta."],
  ["ficha", "Ficha de matrícula e documentos", "Peça a ficha de matrícula e a foto do RG ou CNH (frente e verso)."],
  ["taxa", "Taxa de matrícula (Pix ou boleto)", "Envie o boleto ou o Pix da taxa de matrícula e peça o comprovante."],
  ["comprovante", "Comprovante recebido", "Confirme o comprovante e dê baixa junto ao financeiro."],
  ["enroll", "Matrícula confirmada", "Confirme a matrícula no CRM com o RGM informado pela instituição."],
  ["comunidade", "Tutoria e Comunidade dos Alunos", "Avise que a tutoria entra em contato e convide para a Comunidade dos Alunos."],
  ["afiliado", "Programa de afiliados", "Explique o programa de indicação, sem prometer valores."]
].map(([key, label, instruction]) => ({ key, label, instruction, message: "", optional: key === "objective" || key === "afiliado" }));
export interface ProcessStep { key: string; label: string; instruction: string; message: string; optional?: boolean }
export interface ConnectionPolicy { enabled: boolean; dailyLimit: number }
export interface CopilotConfig {
  version: number; enabled: boolean; aiEnabled: boolean; agentId: number | null;
  dailyLimit: number; userDailyLimit: number; connectionDailyLimit: number;
  connections: Record<string, ConnectionPolicy>; steps: ProcessStep[];
}
export const defaultConfig = (): CopilotConfig => ({ version: 1, enabled: true, aiEnabled: false, agentId: null,
  dailyLimit: 100, userDailyLimit: 20, connectionDailyLimit: 50, connections: {}, steps: DEFAULT_STEPS.map(s => ({ ...s })) });
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
  if (new Set(steps.map(s => s.key)).size !== steps.length || !steps.some(s => s.key === "enroll")) return invalid();
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
