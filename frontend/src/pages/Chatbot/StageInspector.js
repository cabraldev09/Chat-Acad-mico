import React from "react";
import { Button, Checkbox, FormControlLabel, IconButton, MenuItem, Switch, TextField, Typography } from "@material-ui/core";
import { Plus, Trash2 } from "lucide-react";

import NumberField from "../../components/NumberField";
import { COMMERCIAL_OPS, FUNNEL_KEYS } from "./nodes";

// What the "AI stage" block asks of the person and what it can use. Written for people who never saw a prompt:
// every setting says what it changes in the conversation.
const T = (props) => <TextField fullWidth size="small" variant="outlined" margin="dense" InputLabelProps={{ shrink: true }} {...props} />;

export const slugOf = (s, max = 30) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);

export const TOOLS = [
  ["buscar_curso", "Consultar curso", "Duração, grau, modalidade e se tem estágio e TCC. Nunca informa preço."],
  ["buscar_regra_modalidade", "Regra da modalidade (MEC)", "Se o curso foi impactado, aulas ao vivo, práticas presenciais e o texto aprovado. Sem regra cadastrada, a IA não afirma nada."],
  ["buscar_grade", "Grade curricular", "A grade vigente para o ingresso, com carga horária, estágios e TCC."],
  ["buscar_estagio", "Estágio obrigatório", "Semestres, disciplinas e horas do estágio da matriz."],
  ["listar_polos", "Polos", "Os polos ativos (no máximo 5), filtrando pela cidade."],
  ["consultar_conhecimento", "Base de conhecimento", "Trechos aprovados sobre plataforma, tutoria, docentes, estágio remunerado, MEC e matrícula."],
  ["enviar_material", "Enviar a grade em PDF", "Manda o PDF da grade no WhatsApp da pessoa."],
  ["iniciar_analise_curricular", "Iniciar análise curricular", "Usa o histórico em PDF que a pessoa enviou."],
  ["consultar_analise_curricular", "Resultado da análise curricular", "Semestre de ingresso, disciplinas dispensadas e restantes."],
  ["agendar_contato", "Agendar retorno do consultor", "Combina com a pessoa o dia e o horário em que o consultor do polo entra em contato e cria a tarefa para ele."],
  ["simular_bolsa", "Simular bolsa", "Valores de tabela. Não use no agente comercial: valor e bolsa são sempre de um consultor."],
];

// the data of the commercial journey a stage can ask for (the keys are the ones the CRM state uses)
const COMMERCIAL_FIELDS = [
  { key: "courseName", label: "Curso de interesse", type: "text", required: true },
  { key: "city", label: "Cidade", type: "text", required: true },
  { key: "entryType", label: "Tipo de ingresso", type: "choice", required: true, options: ["first_degree", "transfer", "second_degree"] },
  { key: "leadName", label: "Nome", type: "text", required: false },
  { key: "email", label: "E-mail", type: "email", required: false },
  { key: "courseExplained", label: "Curso apresentado", type: "text", required: true },
];

const fieldRow = (f, i, set, fields) => {
  const patch = (p) => set({ fields: fields.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  return (
    <div key={`${f.key}${i}`} style={{ border: "1px solid rgba(127,140,160,.3)", borderRadius: 12, padding: 10, marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <T label="Dado" value={f.label} onChange={(e) => patch({ label: e.target.value })} />
        <IconButton size="small" aria-label="Tirar o dado" onClick={() => set({ fields: fields.filter((_, k) => k !== i) })}><Trash2 size={16} /></IconButton>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <T select label="Tipo" value={f.type || "text"} onChange={(e) => patch({ type: e.target.value })}>
          {[["text", "Texto"], ["number", "Número"], ["email", "E-mail"], ["phone", "Telefone"], ["choice", "Uma opção da lista"], ["date", "Data"]].map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
        </T>
        <FormControlLabel style={{ marginTop: 6, whiteSpace: "nowrap" }} control={<Switch size="small" color="primary" checked={!!f.required} onChange={(e) => patch({ required: e.target.checked })} />} label="Obrigatório" />
      </div>
      {f.type === "choice" && <T label="Opções (separe por vírgula)" value={(f.options || []).join(", ")} onChange={(e) => patch({ options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />}
      <T label="Como perguntar (opcional)" value={f.ask || ""} onChange={(e) => patch({ ask: e.target.value })} placeholder="Pergunte em qual cidade a pessoa mora" />
      <Typography variant="caption" color="textSecondary">Variável do fluxo: {"{{"}{f.key}{"}}"}</Typography>
    </div>
  );
};

const StageInspector = ({ d, set, agents, commercialAgent }) => {
  const fields = d.fields || [];
  const outcomes = d.outcomes || [];
  const http = d.http || [];
  const tools = d.tools || [];
  const hooks = d.hooks || [];
  const isCommercial = hooks.includes("commercial");
  const toggleTool = (k) => set({ tools: tools.includes(k) ? tools.filter((t) => t !== k) : [...tools, k] });
  const patchHttp = (i, p) => set({ http: http.map((x, k) => (k === i ? { ...x, ...p } : x)) });

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <T label="Nome do bloco" value={d.title || ""} onChange={(e) => set({ title: e.target.value })} placeholder="Qualificar interesse" />
      <T label="Objetivo da etapa" multiline rows={3} value={d.objective || ""} onChange={(e) => set({ objective: e.target.value })} helperText="O que a IA precisa conseguir antes de a conversa seguir. Escreva como falaria com uma pessoa da equipe." />
      <T label="Como conduzir (opcional)" multiline rows={4} value={d.instructions || ""} onChange={(e) => set({ instructions: e.target.value })} helperText="Dicas de jeito e de ordem. Regras de valor, bolsa e fatos da instituição ficam nas ferramentas e na base de conhecimento." />
      <T label="Primeira mensagem (opcional)" multiline rows={2} value={d.opening || ""} onChange={(e) => set({ opening: e.target.value })} helperText="Se preencher, a etapa abre com este texto, sem gastar IA. Aceita {{primeiro_nome}}." />
      <FormControlLabel control={<Switch color="primary" checked={!!d.quiet} onChange={(e) => set({ quiet: e.target.checked })} />} label="Esperar a pessoa falar primeiro" />
      <Typography variant="caption" color="textSecondary">Use quando o bloco de antes já disse o que era preciso: a etapa só responde quando a pessoa escrever.</Typography>

      <FormControlLabel control={<Switch color="primary" checked={isCommercial} onChange={(e) => set({ hooks: e.target.checked ? [...hooks.filter((h) => h !== "commercial"), "commercial"] : hooks.filter((h) => h !== "commercial") })} />} label="Acompanhar o CRM sozinho (agente comercial)" />
      <Typography variant="caption" color="textSecondary">
        Liga as regras do sistema depois de cada resposta: guarda o que a pessoa disse, move o lead no funil (só para frente), cria tarefas sem repetir, atualiza temperatura e pontuação e prepara o resumo para o consultor. A IA só entende a mensagem; quem decide é o código.
      </Typography>

      <b style={{ fontSize: 13, marginTop: 10 }}>Dados que a IA descobre</b>
      {fields.map((f, i) => fieldRow(f, i, set, fields))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => set({ fields: [...fields, { key: slugOf(`dado ${fields.length + 1}`), label: `Dado ${fields.length + 1}`, type: "text", required: true }] })}>Adicionar dado</Button>
        {isCommercial && COMMERCIAL_FIELDS.filter((c) => !fields.some((f) => f.key === c.key)).map((c) => (
          <Button key={c.key} size="small" variant="text" onClick={() => set({ fields: [...fields, c] })}>+ {c.label}</Button>
        ))}
      </div>
      <Typography variant="caption" color="textSecondary">Quando todos os obrigatórios estiverem preenchidos, a etapa sai por “Objetivo cumprido”. Os dados que são campos do lead (nome, e-mail, cidade, curso…) vão para o cadastro.</Typography>

      <b style={{ fontSize: 13, marginTop: 10 }}>O que a IA pode consultar</b>
      {TOOLS.map(([k, label, hint]) => (
        <FormControlLabel key={k} style={{ alignItems: "flex-start", marginRight: 0 }} control={<Checkbox size="small" color="primary" checked={tools.includes(k)} onChange={() => toggleTool(k)} style={{ paddingTop: 2 }} />}
          label={<span><span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span><br /><span style={{ fontSize: 12, opacity: 0.72 }}>{hint}</span></span>} />
      ))}
      <FormControlLabel control={<Switch color="primary" checked={d.useKnowledge !== false} onChange={(e) => set({ useKnowledge: e.target.checked })} />} label="Usar a base de conhecimento do agente" />

      <b style={{ fontSize: 13, marginTop: 10 }}>Sistemas externos</b>
      {http.map((t, i) => (
        <div key={`${t.name}${i}`} style={{ border: "1px solid rgba(127,140,160,.3)", borderRadius: 12, padding: 10, marginTop: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <T label="Nome da ferramenta" value={t.name} onChange={(e) => patchHttp(i, { name: slugOf(e.target.value) })} />
            <IconButton size="small" aria-label="Tirar a ferramenta" onClick={() => set({ http: http.filter((_, k) => k !== i) })}><Trash2 size={16} /></IconButton>
          </div>
          <T label="Quando usar" value={t.description} onChange={(e) => patchHttp(i, { description: e.target.value })} placeholder="Consulta os horários livres de um dia" />
          <div style={{ display: "flex", gap: 6 }}>
            <T select label="Método" style={{ width: 110 }} value={t.method || "GET"} onChange={(e) => patchHttp(i, { method: e.target.value })}>
              <MenuItem value="GET">Consulta (GET)</MenuItem>
              <MenuItem value="POST">Envio (POST)</MenuItem>
            </T>
            <T label="Endereço (https://…)" value={t.url} onChange={(e) => patchHttp(i, { url: e.target.value })} />
          </div>
          {(t.params || []).map((p, pi) => (
            <div key={pi} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <T label="Informação" style={{ width: 120 }} value={p.name} onChange={(e) => patchHttp(i, { params: t.params.map((x, k) => (k === pi ? { ...x, name: slugOf(e.target.value) } : x)) })} />
              <T label="O que é" value={p.description} onChange={(e) => patchHttp(i, { params: t.params.map((x, k) => (k === pi ? { ...x, description: e.target.value } : x)) })} />
              <IconButton size="small" aria-label="Tirar a informação" onClick={() => patchHttp(i, { params: t.params.filter((_, k) => k !== pi) })}><Trash2 size={15} /></IconButton>
            </div>
          ))}
          <Button size="small" onClick={() => patchHttp(i, { params: [...(t.params || []), { name: `info${(t.params || []).length + 1}`, description: "", type: "string", required: true }] })}>+ informação que a IA envia</Button>
          <div style={{ display: "flex", gap: 6 }}>
            <T label="Cabeçalho (opcional)" value={t.headerName || ""} onChange={(e) => patchHttp(i, { headerName: e.target.value })} placeholder="X-Api-Key" />
            <T label="Valor do cabeçalho" type="password" value={t.headerValue || ""} onChange={(e) => patchHttp(i, { headerValue: e.target.value })} />
          </div>
        </div>
      ))}
      {http.length < 5 && (
        <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => set({ http: [...http, { name: `ferramenta_${http.length + 1}`, description: "", url: "", method: "GET", params: [] }] })}>Adicionar sistema externo</Button>
      )}
      <Typography variant="caption" color="textSecondary">A chamada é feita pelo sistema (só endereços públicos). O que volta é lido pela IA como dado, nunca como ordem. No teste, chamadas de envio (POST) não são feitas.</Typography>

      <b style={{ fontSize: 13, marginTop: 10 }}>Caminhos de saída</b>
      <Typography variant="caption" color="textSecondary">“Objetivo cumprido”, “Pediu uma pessoa”, “Fora do escopo” e “Limite de turnos” já existem. Crie outros para decisões como “Quer proposta” ou “Já é aluno”.</Typography>
      {outcomes.map((o, i) => (
        <div key={`${o.id}${i}`} style={{ border: "1px solid rgba(127,140,160,.3)", borderRadius: 12, padding: 10, marginTop: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <T label="Nome do caminho" value={o.label} onChange={(e) => set({ outcomes: outcomes.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
            <IconButton size="small" aria-label="Tirar o caminho" onClick={() => set({ outcomes: outcomes.filter((_, k) => k !== i) })}><Trash2 size={16} /></IconButton>
          </div>
          <T label="Quando seguir por ele" value={o.when} onChange={(e) => set({ outcomes: outcomes.map((x, k) => (k === i ? { ...x, when: e.target.value } : x)) })} placeholder="Quando a pessoa perguntar o valor" />
        </div>
      ))}
      {outcomes.length < 8 && (
        <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => { const n = outcomes.length + 1; set({ outcomes: [...outcomes, { id: slugOf(`caminho ${n}`), label: `Caminho ${n}`, when: "" }] }); }}>Adicionar caminho</Button>
      )}

      <b style={{ fontSize: 13, marginTop: 10 }}>Limites</b>
      <div style={{ display: "flex", gap: 8 }}>
        <NumberField fullWidth size="small" variant="outlined" margin="dense" label="Máximo de mensagens da IA" InputLabelProps={{ shrink: true }} value={d.maxTurns || 12} onChange={(v) => set({ maxTurns: Math.min(50, Math.max(1, v || 12)) })} />
        <NumberField fullWidth size="small" variant="outlined" margin="dense" label="Mensagens que a IA relê" InputLabelProps={{ shrink: true }} value={d.historyTurns || 6} onChange={(v) => set({ historyTurns: Math.min(12, Math.max(2, v || 6)) })} />
      </div>
      <Typography variant="caption" color="textSecondary">Depois do máximo, a conversa sai por “Limite de turnos”. Menos mensagens relidas gasta menos IA; o resumo e os dados já coletados continuam valendo.</Typography>

      {agents && agents.length > 1 && !commercialAgent && (
        <T select label="Falar como o agente" value={d.agentId || ""} onChange={(e) => set({ agentId: e.target.value ? Number(e.target.value) : null })}>
          <MenuItem value="">O agente deste fluxo</MenuItem>
          {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </T>
      )}
    </div>
  );
};

export const CommercialInspector = ({ d, set, lists }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <T label="Nome do bloco" value={d.title || ""} onChange={(e) => set({ title: e.target.value })} placeholder="CRM: Pronto para proposta" />
    <T select label="O que fazer" value={d.op || ""} onChange={(e) => set({ op: e.target.value })}>
      {Object.entries(COMMERCIAL_OPS).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
    </T>
    {d.op === "sync_stage" && (
      <>
        <T select label="Coluna do funil" value={d.stageKey || ""} onChange={(e) => set({ stageKey: e.target.value })}>
          {Object.entries(FUNNEL_KEYS).map(([k, l]) => <MenuItem key={k} value={k}>{l}{lists && lists.funnel && lists.funnel[k] ? ` → ${lists.funnel[k]}` : ""}</MenuItem>)}
        </T>
        <T label="Motivo registrado no histórico" value={d.reason || ""} onChange={(e) => set({ reason: e.target.value })} />
        <Typography variant="caption" color="textSecondary">O lead só anda para frente e só entre as colunas da jornada: uma coluna que a equipe escolheu à mão é respeitada. A coluna “Matriculado” não está na lista porque só a matrícula confirmada pelo sistema a preenche. Ajuste qual coluna do CRM cada passo usa em Agentes de IA → Funil do CRM.</Typography>
      </>
    )}
    {d.op === "task" && (
      <>
        <T label="Título da tarefa" value={d.title || ""} onChange={(e) => set({ title: e.target.value })} />
        <NumberField fullWidth size="small" variant="outlined" margin="dense" label="Prazo (minutos)" InputLabelProps={{ shrink: true }} value={d.minutes || 60} onChange={(v) => set({ minutes: v || 60 })} />
        <Typography variant="caption" color="textSecondary">A tarefa não se repete para o mesmo lead e o próximo contato do lead acompanha o prazo.</Typography>
      </>
    )}
    {d.op === "ensure_lead" && <Typography variant="caption" color="textSecondary">Acha o lead pelo telefone (com ou sem o 9), cria se não existir e carrega o que o CRM já sabe: a IA nunca pergunta de novo nome, curso, cidade ou polo.</Typography>}
    {d.op === "handoff_brief" && <Typography variant="caption" color="textSecondary">Monta o resumo para o consultor sem usar IA (nome, curso, cidade, ingresso, o que já foi explicado, objeção, temperatura, pontuação e próxima ação) e grava na conversa e no histórico do lead.</Typography>}
    {d.op === "note" && <Typography variant="caption" color="textSecondary">Escreve uma nota curta no lead com o que foi descoberto; só grava quando o texto mudou.</Typography>}
    {d.op === "start_analysis" && <Typography variant="caption" color="textSecondary">Usa o último PDF de histórico que a pessoa enviou. Sem arquivo, o lead vai para “Aguardando histórico” e cria uma tarefa. Depois deste bloco, use uma Condição em “Uma resposta do fluxo” → analysisStatus.</Typography>}
  </div>
);

export default StageInspector;
