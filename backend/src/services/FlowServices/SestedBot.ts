import type { Graph } from "./Graph";

// blocks by key and links by key, laid out by depth (no model imports: the migration that installs the bot loads this file alone)
const build = (spec: { nodes: Array<[string, string, any]>; links: Array<[string, string, string?]> }): Graph => {
  const edges = spec.links.map(([source, target, handle], i) => ({ id: `e${i}`, source, target, sourceHandle: handle || null }));
  const depth = new Map<string, number>([["start", 0]]);
  const queue = ["start"];
  while (queue.length) {
    const id = queue.shift() as string;
    edges.filter(e => e.source === id).forEach(e => {
      if (!depth.has(e.target)) {
        depth.set(e.target, (depth.get(id) || 0) + 1);
        queue.push(e.target);
      }
    });
  }
  const rows = new Map<number, number>();
  const nodes = spec.nodes.map(([id, type, data]) => {
    const col = depth.get(id) ?? 0;
    const row = rows.get(col) || 0;
    rows.set(col, row + 1);
    return { id, type, data, x: 60 + col * 340, y: 60 + row * 230 };
  });
  return { nodes, edges } as Graph;
};

// The qualification bot of the SESTED (its own courses: graduação, técnico, técnico por competência, pós). It runs on the official number
// shared with the commercial team, by the keyword "SESTED" (the ad and the link of the SESTED send "Quero conhecer os cursos da SESTED")
// and as the bot of a SESTED campaign. With buttons it learns the name, the city, what the person looks for, the schooling and the one
// question that decides the path, then the lead goes to the next consultant of the SESTED queue, who calls them from their own WhatsApp.
// No values, scholarships or deadlines are said here: that is the consultant's.
export const SESTED_FLOW_NAME = "Bot SESTED: qualificação";
export const SESTED_KEYWORDS = ["sested"];

export const sestedGraph = (ids: { institutionId?: number | null; queueId?: number | null; tagId?: number | null } = {}): Graph => {
  const queue = ids.queueId || null;
  return build({
    nodes: [
      ["start", "start", {}],
      ["inst", "crm", { action: "set_institution", institutionId: ids.institutionId || null }],
      ["oi", "buttons", {
        text: "Olá! Aqui é a SESTED. Vou te fazer algumas perguntas rápidas para um consultor já te atender com o curso certo. Como posso te ajudar?",
        options: [
          { id: "o1", label: "Conhecer os cursos", keywords: "curso, cursos, conhecer, quero" },
          { id: "o2", label: "Já sou aluno", keywords: "aluno, aluna, matriculado" },
          { id: "o3", label: "Falar com consultor", keywords: "consultor, atendente, pessoa, humano" }
        ]
      }],
      ["aluno", "message", { text: "Certo. Vou chamar a equipe da SESTED para te atender por aqui." }],
      ["aluno_t", "transfer", { to: "queue", queueId: queue }],
      ["nome", "ask", { text: "Para começar, qual é o seu nome completo?", field: "nome", validate: "text" }],
      ["cidade", "ask", { text: "Em qual cidade você mora?", field: "cidade", validate: "text" }],
      ["tipo", "buttons", {
        text: "O que você procura?",
        saveTo: "tipo_curso",
        options: [
          { id: "t1", label: "Graduação", keywords: "faculdade, superior, bacharelado, licenciatura, tecnologo" },
          { id: "t2", label: "Técnico", keywords: "tecnico regular, curso tecnico" },
          { id: "t3", label: "Técnico por competência", keywords: "competencia, certificacao, experiencia" },
          { id: "t4", label: "Pós-graduação", keywords: "pos, especializacao, mba" }
        ]
      }],
      ["form", "buttons", {
        text: "Qual é a sua formação até agora?",
        saveTo: "escolaridade",
        options: [
          { id: "f1", label: "Ensino médio cursando" },
          { id: "f2", label: "Ensino médio completo" },
          { id: "f3", label: "Técnico" },
          { id: "f4", label: "Superior cursando" },
          { id: "f5", label: "Superior completo" }
        ]
      }],
      ["rota", "condition", {
        rules: [
          { id: "r1", label: "Graduação", all: [{ field: "var:tipo_curso", op: "eq", value: "Graduação" }] },
          { id: "r2", label: "Técnico por competência", all: [{ field: "var:tipo_curso", op: "eq", value: "Técnico por competência" }] },
          { id: "r3", label: "Pós sem superior completo", all: [{ field: "var:tipo_curso", op: "eq", value: "Pós-graduação" }, { field: "var:escolaridade", op: "neq", value: "Superior completo" }] }
        ]
      }],
      ["grad", "buttons", {
        text: "É a sua primeira graduação?",
        saveTo: "primeira_graduacao",
        options: [{ id: "g1", label: "Sim" }, { id: "g2", label: "Não" }]
      }],
      ["comp", "buttons", {
        text: "O técnico por competência é para quem já trabalha na área do curso. Você já trabalha nessa área?",
        saveTo: "trabalha_na_area",
        options: [{ id: "c1", label: "Sim" }, { id: "c2", label: "Não" }]
      }],
      ["comp_nao", "message", { text: "Sem experiência na área, o caminho costuma ser o técnico regular. O consultor explica as duas opções para você." }],
      ["pos", "buttons", {
        text: "A pós-graduação é para quem já concluiu uma graduação. Qual caminho você quer seguir?",
        saveTo: "tipo_curso",
        options: [{ id: "p1", label: "Graduação" }, { id: "p2", label: "Pós-graduação" }]
      }],
      ["resumo", "buttons", {
        text: "Anotei: {{vars.tipo_curso}}, em {{vars.cidade}}, formação {{vars.escolaridade}}. Está certo?",
        options: [{ id: "s1", label: "Está certo", keywords: "sim, certo, ok, isso" }, { id: "s2", label: "Corrigir", keywords: "nao, errado, corrigir, mudar" }]
      }],
      ["crm", "crm", { action: "send_to_crm", ownerMode: "queue", queueId: queue, institutionId: ids.institutionId || null, tagId: ids.tagId || null, source: "Bot SESTED" }],
      ["numero", "condition", { rules: [{ id: "n1", label: "Consultor com número próprio", all: [{ field: "var:consultor_whatsapp", op: "notempty", value: "" }] }] }],
      ["fim_num", "message", { text: "Pronto. {{consultor}}, da SESTED, vai te chamar pelo WhatsApp {{consultor_whatsapp}}. Pode salvar esse número." }],
      ["fim", "message", { text: "Pronto. Um consultor da SESTED vai continuar o seu atendimento em instantes." }],
      ["passa", "transfer", { to: "lead_owner", queueId: queue }]
    ],
    links: [
      ["start", "inst"], ["inst", "oi"],
      ["oi", "nome", "o1"], ["oi", "aluno", "o2"], ["oi", "crm", "o3"], ["oi", "nome", "other"],
      ["aluno", "aluno_t"],
      ["nome", "cidade"], ["cidade", "tipo"],
      ["tipo", "form", "t1"], ["tipo", "form", "t2"], ["tipo", "form", "t3"], ["tipo", "form", "t4"], ["tipo", "crm", "other"],
      ["form", "rota", "f1"], ["form", "rota", "f2"], ["form", "rota", "f3"], ["form", "rota", "f4"], ["form", "rota", "f5"], ["form", "crm", "other"],
      ["rota", "grad", "r1"], ["rota", "comp", "r2"], ["rota", "pos", "r3"], ["rota", "resumo", "else"],
      ["grad", "resumo", "g1"], ["grad", "resumo", "g2"], ["grad", "crm", "other"],
      ["comp", "resumo", "c1"], ["comp", "comp_nao", "c2"], ["comp", "crm", "other"], ["comp_nao", "resumo"],
      ["pos", "grad", "p1"], ["pos", "resumo", "p2"], ["pos", "crm", "other"],
      ["resumo", "crm", "s1"], ["resumo", "nome", "s2"], ["resumo", "crm", "other"],
      ["crm", "numero"], ["numero", "fim_num", "n1"], ["numero", "fim", "else"], ["fim_num", "passa"], ["fim", "passa"]
    ]
  });
};
