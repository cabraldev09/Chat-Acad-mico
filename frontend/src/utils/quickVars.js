// Variables that can be used in a quick reply: they are filled in when the reply is inserted in the conversation.
export const QUICK_VARIABLES = [
  { token: "{{nome}}", help: "nome do contato" },
  { token: "{{primeiro_nome}}", help: "só o primeiro nome do contato" },
  { token: "{{saudacao}}", help: "Bom dia, Boa tarde ou Boa noite, conforme a hora" },
  { token: "{{atendente}}", help: "seu nome" },
  { token: "{{data}}", help: "data de hoje" },
  { token: "{{hora}}", help: "hora de agora" },
];

const greeting = (d) => (d.getHours() < 12 ? "Bom dia" : d.getHours() < 18 ? "Boa tarde" : "Boa noite");

export const fillQuickVars = (text, { contactName = "", agentName = "" } = {}) => {
  const now = new Date();
  const first = String(contactName).trim().split(/\s+/)[0] || "";
  const table = {
    nome: contactName,
    primeiro_nome: first,
    name: contactName, // the old spelling used by campaigns keeps working
    saudacao: greeting(now),
    atendente: agentName,
    data: now.toLocaleDateString("pt-BR"),
    hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
  return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key) => {
    const v = table[key.toLowerCase()];
    return v === undefined ? whole : v;
  });
};
