import React from "react";
import { Button, FormControlLabel, IconButton, MenuItem, Switch, TextField, Typography } from "@material-ui/core";
import { Plus, Trash2 } from "lucide-react";

import NumberField from "../../components/NumberField";
import { ACTION_LABEL, BLOCKS, TRANSFER_LABEL, newId } from "./nodes";

const FIELDS = [
  ["nome", "Nome (vai para o cadastro do lead)"], ["email", "E-mail (vai para o cadastro)"], ["cidade", "Cidade (vai para o cadastro)"],
  ["curso", "Curso de interesse (vai para o cadastro)"], ["modalidade", "Modalidade (vai para o cadastro)"], ["forma_ingresso", "Forma de ingresso (vai para o cadastro)"],
  ["semestre_transferencia", "Semestre da transferência (vai para o cadastro)"],
];
const CONDITION_FIELDS = [
  ["hours", "Horário de atendimento"], ["tag", "Etiquetas do lead"], ["lead.course", "Curso do lead"], ["lead.polo", "Polo do lead"], ["lead.stage", "Etapa do funil"],
  ["lead.city", "Cidade do lead"], ["lead.source", "Origem do lead"], ["channel", "Canal da conversa"], ["message", "Última mensagem da pessoa"],
];
const OPS = [["eq", "é igual a"], ["neq", "é diferente de"], ["contains", "contém"], ["notcontains", "não contém"], ["empty", "está vazio"], ["notempty", "não está vazio"]];
const VALIDATE = [["text", "Texto livre"], ["email", "E-mail"], ["phone", "Telefone"], ["number", "Número"]];

const T = (props) => <TextField fullWidth size="small" variant="outlined" margin="dense" InputLabelProps={{ shrink: true }} {...props} />;

const Section = ({ children }) => <div style={{ display: "grid", gap: 4 }}>{children}</div>;

// the vocabulary of the text blocks
const VarsHint = () => (
  <Typography variant="caption" color="textSecondary">
    Variáveis: {"{{primeiro_nome}}"}, {"{{nome}}"} e o nome de qualquer resposta guardada, como {"{{curso}}"}.
  </Typography>
);

const Inspector = ({ node, update, remove, lists, nodes }) => {
  if (!node) {
    return (
      <div style={{ padding: 16, opacity: 0.75, fontSize: 14, lineHeight: 1.5 }}>
        Clique em um bloco para editar. Arraste um bloco da lista para o quadro e ligue as bolinhas: cada opção de um botão leva para o seu próprio caminho.
      </div>
    );
  }
  const d = node.data || {};
  const set = (patch) => update(node.id, patch);
  const b = BLOCKS[node.type];
  const text = (label = "Texto", rows = 4) => <T label={label} multiline rows={rows} value={d.text || ""} onChange={(e) => set({ text: e.target.value })} />;

  return (
    <div style={{ padding: 16, display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ flex: 1, fontSize: 15 }}>{b.title}</b>
        {node.type !== "start" && <IconButton size="small" aria-label="Apagar o bloco" onClick={() => remove(node.id)}><Trash2 size={17} /></IconButton>}
      </div>
      <Typography variant="caption" color="textSecondary">{b.hint}</Typography>

      {node.type === "message" && <Section>{text("Mensagem")}<VarsHint /></Section>}

      {node.type === "buttons" && (
        <Section>
          {text("Pergunta")}
          <VarsHint />
          <b style={{ fontSize: 13, marginTop: 8 }}>Opções (até 10)</b>
          {(d.options || []).map((o, i) => (
            <div key={o.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <T label={`Opção ${i + 1}`} value={o.label} onChange={(e) => set({ options: d.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} />
                <T label="Palavras que também escolhem esta opção (opcional)" value={o.keywords || ""} onChange={(e) => set({ options: d.options.map((x) => (x.id === o.id ? { ...x, keywords: e.target.value } : x)) })} placeholder="bolsa, desconto" />
              </div>
              <IconButton size="small" aria-label="Tirar a opção" style={{ marginTop: 14 }} onClick={() => set({ options: d.options.filter((x) => x.id !== o.id) })}><Trash2 size={16} /></IconButton>
            </div>
          ))}
          {(d.options || []).length < 10 && (
            <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => set({ options: [...(d.options || []), { id: newId("o"), label: `Opção ${(d.options || []).length + 1}` }] })}>Adicionar opção</Button>
          )}
          <T label="Guardar a escolha em (opcional)" value={d.saveTo || ""} onChange={(e) => set({ saveTo: e.target.value.replace(/[^\w]/g, "") })} placeholder="modalidade" helperText="A escolha vira uma variável e, se for um campo do lead (modalidade, curso…), vai para o cadastro." />
          <Typography variant="caption" color="textSecondary">No WhatsApp as opções aparecem numeradas; a pessoa responde com o número, o nome ou uma palavra da lista. A saída “Resposta inesperada” é usada depois de 2 tentativas.</Typography>
        </Section>
      )}

      {node.type === "ask" && (
        <Section>
          {text("Pergunta")}
          <VarsHint />
          <T select label="Onde guardar a resposta" value={FIELDS.some(([k]) => k === d.field) ? d.field : "__custom"} onChange={(e) => set({ field: e.target.value === "__custom" ? "resposta" : e.target.value })}>
            {FIELDS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            <MenuItem value="__custom">Outra variável do fluxo</MenuItem>
          </T>
          {!FIELDS.some(([k]) => k === d.field) && <T label="Nome da variável" value={d.field || ""} onChange={(e) => set({ field: e.target.value.replace(/[^\w]/g, "") })} />}
          <T select label="Tipo de resposta" value={d.validate || "text"} onChange={(e) => set({ validate: e.target.value })}>
            {VALIDATE.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </T>
        </Section>
      )}

      {node.type === "condition" && (
        <Section>
          {(d.rules || []).map((r) => (
            <div key={r.id} style={{ border: "1px solid rgba(127,140,160,.3)", borderRadius: 12, padding: 10, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <T label="Nome da condição" value={r.label} onChange={(e) => set({ rules: d.rules.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} />
                <IconButton size="small" aria-label="Tirar a condição" onClick={() => set({ rules: d.rules.filter((x) => x.id !== r.id) })}><Trash2 size={16} /></IconButton>
              </div>
              {(r.all || []).map((c, ci) => (
                <div key={ci} style={{ display: "grid", gap: 2, marginTop: 4 }}>
                  <T select label={ci === 0 ? "Quando" : "E também"} value={CONDITION_FIELDS.some(([k]) => k === c.field) ? c.field : "__var"} onChange={(e) => set({ rules: d.rules.map((x) => (x.id === r.id ? { ...x, all: x.all.map((y, k) => (k === ci ? { ...y, field: e.target.value === "__var" ? "var:" : e.target.value } : y)) } : x)) })}>
                    {CONDITION_FIELDS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
                    <MenuItem value="__var">Uma resposta do fluxo</MenuItem>
                  </T>
                  {String(c.field).startsWith("var:") && <T label="Nome da variável" value={c.field.slice(4)} onChange={(e) => set({ rules: d.rules.map((x) => (x.id === r.id ? { ...x, all: x.all.map((y, k) => (k === ci ? { ...y, field: `var:${e.target.value.replace(/[^\w]/g, "")}` } : y)) } : x)) })} />}
                  <div style={{ display: "flex", gap: 6 }}>
                    <T select label="Condição" value={c.op} onChange={(e) => set({ rules: d.rules.map((x) => (x.id === r.id ? { ...x, all: x.all.map((y, k) => (k === ci ? { ...y, op: e.target.value } : y)) } : x)) })}>
                      {OPS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
                    </T>
                    {!["empty", "notempty"].includes(c.op) && (
                      <T label="Valor" value={c.value ?? ""} onChange={(e) => set({ rules: d.rules.map((x) => (x.id === r.id ? { ...x, all: x.all.map((y, k) => (k === ci ? { ...y, value: e.target.value } : y)) } : x)) })}
                        helperText={c.field === "hours" ? "open ou closed" : undefined} />
                    )}
                  </div>
                </div>
              ))}
              <Button size="small" onClick={() => set({ rules: d.rules.map((x) => (x.id === r.id ? { ...x, all: [...(x.all || []), { field: "tag", op: "contains", value: "" }] } : x)) })}>+ outra condição (E)</Button>
            </div>
          ))}
          <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => set({ rules: [...(d.rules || []), { id: newId("r"), label: `Condição ${(d.rules || []).length + 1}`, all: [{ field: "tag", op: "contains", value: "" }] }] })}>Adicionar condição</Button>
          <Typography variant="caption" color="textSecondary">As condições são testadas na ordem; a primeira que valer decide o caminho. Se nenhuma valer, segue a saída “Senão”.</Typography>
        </Section>
      )}

      {node.type === "crm" && (
        <Section>
          <T select label="O que fazer" value={d.action || ""} onChange={(e) => set({ action: e.target.value })}>
            {Object.entries(ACTION_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </T>
          {d.action === "send_to_crm" && (
            <>
              <Typography variant="caption" color="textSecondary">Cria o lead (ou atualiza o que já existe) com tudo o que a pessoa respondeu e deixa o resumo no histórico.</Typography>
              <T select label="Etapa do funil (opcional)" value={d.stageId || ""} onChange={(e) => set({ stageId: e.target.value || null })}>
                <MenuItem value="">Manter a etapa atual</MenuItem>
                {lists.stages.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </T>
              <T select label="Etiqueta (opcional)" value={d.tagId || ""} onChange={(e) => set({ tagId: e.target.value || null })}>
                <MenuItem value="">Nenhuma</MenuItem>
                {lists.tags.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
              </T>
              <T select label="Responsável" value={d.userId ? "user" : d.ownerMode || "keep"} onChange={(e) => set(e.target.value === "user" ? { userId: lists.users[0] ? lists.users[0].id : null, ownerMode: null } : { userId: null, ownerMode: e.target.value })}>
                <MenuItem value="keep">Manter</MenuItem>
                <MenuItem value="roundrobin">Rodízio entre os consultores</MenuItem>
                <MenuItem value="user">Uma pessoa</MenuItem>
              </T>
              {d.userId && (
                <T select label="Pessoa" value={d.userId} onChange={(e) => set({ userId: e.target.value })}>
                  {lists.users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
                </T>
              )}
            </>
          )}
          {d.action === "move_stage" && (
            <T select label="Etapa" value={d.stageId || ""} onChange={(e) => set({ stageId: e.target.value })}>
              {lists.stages.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </T>
          )}
          {(d.action === "add_tag" || d.action === "remove_tag") && (
            <T select label="Etiqueta" value={d.tagId || ""} onChange={(e) => set({ tagId: e.target.value })}>
              {lists.tags.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </T>
          )}
          {d.action === "set_owner" && (
            <T select label="Responsável" value={d.userId || ""} onChange={(e) => set({ userId: e.target.value || null })}>
              <MenuItem value="">Rodízio entre os consultores</MenuItem>
              {lists.users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
            </T>
          )}
          {d.action === "set_polo" && (
            <T select label="Polo" value={d.poloId || ""} onChange={(e) => set({ poloId: e.target.value })}>
              {lists.polos.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </T>
          )}
          {d.action === "create_task" && (
            <>
              <T label="Título da tarefa" value={d.title || ""} onChange={(e) => set({ title: e.target.value })} />
              <NumberField fullWidth size="small" variant="outlined" margin="dense" label="Prazo (minutos)" InputLabelProps={{ shrink: true }} value={d.minutes || 60} onChange={(v) => set({ minutes: v || 60 })} />
            </>
          )}
          {d.action === "add_note" && text("Nota", 3)}
        </Section>
      )}

      {node.type === "delay" && (
        <Section>
          <NumberField fullWidth size="small" variant="outlined" margin="dense" label="Esperar (minutos)" InputLabelProps={{ shrink: true }} value={d.minutes} onChange={(v) => set({ minutes: v })} />
          <Typography variant="caption" color="textSecondary">A conversa continua sozinha depois desse tempo (conferido a cada 30 segundos). Se a pessoa escrever enquanto espera, o fluxo não responde.</Typography>
        </Section>
      )}

      {node.type === "ai" && (
        <Section>
          {text("Mensagem antes de passar para a IA (opcional)", 3)}
          <Typography variant="caption" color="textSecondary">O agente de IA assume a conversa e este fluxo termina. Configure o agente em Agentes de IA.</Typography>
        </Section>
      )}

      {node.type === "transfer" && (
        <Section>
          <T select label="Levar para" value={d.to || ""} onChange={(e) => set({ to: e.target.value })}>
            {Object.entries(TRANSFER_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </T>
          {d.to === "queue" && (
            <T select label="Fila" value={d.queueId || ""} onChange={(e) => set({ queueId: e.target.value })}>
              {lists.queues.map((q) => <MenuItem key={q.id} value={q.id}>{q.name}</MenuItem>)}
            </T>
          )}
          {d.to === "user" && (
            <T select label="Atendente" value={d.userId || ""} onChange={(e) => set({ userId: e.target.value })}>
              {lists.users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
            </T>
          )}
          {text("Mensagem ao transferir (opcional)", 3)}
          <Typography variant="caption" color="textSecondary">Este é o último passo do fluxo: depois dele a equipe atende.</Typography>
        </Section>
      )}

      {node.type === "webhook" && (
        <Section>
          <T label="Endereço (https://…)" value={d.url || ""} onChange={(e) => set({ url: e.target.value })} />
          <Typography variant="caption" color="textSecondary">Envia o que a pessoa respondeu. Só endereços públicos são aceitos.</Typography>
        </Section>
      )}

      {node.type === "random" && (
        <Section>
          {(d.branches || []).map((x) => (
            <div key={x.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <T label="Caminho" value={x.label} onChange={(e) => set({ branches: d.branches.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)) })} />
              <NumberField size="small" variant="outlined" margin="dense" label="Peso" style={{ width: 80 }} InputLabelProps={{ shrink: true }} value={x.weight} onChange={(v) => set({ branches: d.branches.map((y) => (y.id === x.id ? { ...y, weight: v || 1 } : y)) })} />
              <IconButton size="small" aria-label="Tirar o caminho" style={{ marginTop: 14 }} onClick={() => set({ branches: d.branches.filter((y) => y.id !== x.id) })}><Trash2 size={16} /></IconButton>
            </div>
          ))}
          <Button size="small" variant="outlined" startIcon={<Plus size={15} />} onClick={() => set({ branches: [...(d.branches || []), { id: newId("b"), label: `Caminho ${(d.branches || []).length + 1}`, weight: 1 }] })}>Adicionar caminho</Button>
          <Typography variant="caption" color="textSecondary">Cada pessoa vai por um caminho, na proporção dos pesos. Compare os resultados nos números sobre os blocos.</Typography>
        </Section>
      )}

      {node.type === "goto" && (
        <T select label="Voltar para o bloco" value={d.target || ""} onChange={(e) => set({ target: e.target.value })}>
          {nodes.filter((n) => !["start", "comment"].includes(n.type) && n.id !== node.id).map((n) => <MenuItem key={n.id} value={n.id}>{BLOCKS[n.type].title}: {String(n.data.text || n.data.label || "").slice(0, 28) || n.id.slice(-4)}</MenuItem>)}
        </T>
      )}

      {node.type === "end" && (
        <Section>
          {text("Mensagem final (opcional)", 3)}
          <FormControlLabel control={<Switch color="primary" checked={!!d.close} onChange={(e) => set({ close: e.target.checked })} />} label="Finalizar a conversa" />
        </Section>
      )}

      {node.type === "comment" && <Section>{text("Anotação", 4)}</Section>}
      {node.type === "start" && <Typography variant="body2" color="textSecondary">Defina quando este fluxo começa (primeira mensagem, palavra-chave…) no botão “Quando começa” da barra de cima.</Typography>}
    </div>
  );
};

export default Inspector;
