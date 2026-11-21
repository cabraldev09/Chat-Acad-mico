import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, MenuItem, TextField } from "@material-ui/core";
import { RefreshCw, Send, Plus, Trash2, X } from "lucide-react";

import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import IconAction from "../../components/IconAction";

// Configurações → Modelos da Meta: the templates of the official WhatsApp account by department, with their status (updated live), the
// recommended pack (written as notices for Utility, the cheapest paid category; the Meta may still move one to Marketing), and a form to create a new one with its
// department, where it is used and up to 3 quick-reply buttons.
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };
const hint = { fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 };

const STATUS = {
  APPROVED: ["Aprovado", "#15803d"],
  PENDING: ["Em análise", "#b45309"],
  IN_APPEAL: ["Em recurso", "#b45309"],
  REJECTED: ["Recusado", "#b91c1c"],
  PAUSED: ["Pausado", "#b91c1c"],
  DISABLED: ["Desativado", "#b91c1c"],
};
const USE = { abertura: "Abertura do departamento (fora das 24 h)", aviso: "Aviso do sistema", campanha: "Campanhas" };
const DEPT_ORDER = ["atendimento", "tutoria", "relacionamento", "financeiro"];

const Badge = ({ status }) => {
  const [label, color] = STATUS[status] || [status || "Não enviado", "var(--text-2)"];
  return <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>{label}</span>;
};

// how the person sees it on WhatsApp: the text with the examples filled in and the buttons under it
const Bubble = ({ body, examples = [], buttons = [] }) => {
  const text = String(body || "").replace(/\{\{(\d+)\}\}/g, (m, n) => examples[Number(n) - 1] || m);
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 10, display: "grid", gap: 4, maxWidth: 520 }}>
      <div style={{ background: "var(--surface)", borderRadius: "10px 10px 10px 2px", padding: "8px 10px", fontSize: 13.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", boxShadow: "0 1px .5px rgba(11,20,26,.15)" }}>{text || <i style={{ opacity: .6 }}>Texto do modelo</i>}</div>
      {buttons.filter(Boolean).map((b, i) => <div key={i} style={{ background: "var(--surface)", borderRadius: 10, padding: "6px 10px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{b}</div>)}
    </div>
  );
};

const Row = ({ t, onRemove }) => (
  <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", minWidth: 0, display: "grid", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, wordBreak: "break-all", flex: "1 1 160px" }}>{t.name}</span>
      <Badge status={t.status} />
      {t.category === "MARKETING" && <span title="A Meta classificou como Marketing: cada envio custa mais que Utilidade" style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#b45309", border: "1px solid #b45309", borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>Marketing (mais caro)</span>}
      {onRemove && <IconAction title="Remover da conta da Meta" onClick={() => onRemove(t.name)}><Trash2 size={15} /></IconAction>}
    </div>
    {(t.purpose || t.use) && <div style={{ fontSize: 13 }}>{t.purpose}{t.use ? <span style={{ color: "var(--text-2)" }}>{t.purpose ? " · " : ""}{USE[t.use] || t.use}</span> : null}</div>}
    {t.reason && <div style={{ fontSize: 13, color: "#b91c1c" }}>Motivo da Meta: {t.reason}</div>}
    {t.body && <div style={{ ...hint, overflowWrap: "anywhere" }}>{t.body}</div>}
    {t.buttons && t.buttons.length > 0 && <div style={hint}>Botões: {t.buttons.join(" · ")}</div>}
  </div>
);

const paramsIn = (body) => {
  const nums = (String(body || "").match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.replace(/\D/g, "")));
  return nums.length ? Math.max(...nums) : 0;
};
const EMPTY = { name: "", body: "", examples: [], department: "atendimento", use: "campanha", purpose: "", buttons: [] };

// where each approved template is used by the system (filled by itself when a pack template is approved; can be changed here)
const IN_USE = [
  ["atendimento_template_name", "Atendimento: retomar a conversa (fora das 24 h)", "{{1}} = nome do lead, {{2}} = quem escreve"],
  ["tutoria_template_name", "Tutoria: retomar a conversa (fora das 24 h)", "{{1}} = nome do aluno, {{2}} = quem escreve"],
  ["boas_vindas_template_name", "Matrícula confirmada: contato da tutoria", "{{1}} = nome, {{2}} = curso, {{3}} = tutor, {{4}} = número"],
  ["relacionamento_template_name", "Retenção: retomar a conversa (fora das 24 h)", "{{1}} = nome do aluno, {{2}} = quem escreve"],
  ["rematricula_template_name", "Retenção: prazo de rematrícula", "{{1}} = nome, {{2}} = curso, {{3}} = fim do prazo"],
];

export default function MetaTemplates({ values, save }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // an automatic refresh that failed: the list on screen may be old (said, with "try again")
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const quiet = useRef(false);

  const load = useCallback(async (silent) => {
    if (!silent) setBusy(true);
    try {
      const { data: d } = await api.get("/meta/templates");
      setData(d);
      setError("");
      setStale(false);
      if (d.linked && d.linked.length) toast.success(`Aprovado e já em uso: ${d.linked.join(", ")}.`);
    } catch (err) {
      if (!silent) setError(err?.response?.data?.error || err?.response?.data?.message || "Não foi possível ler os modelos na Meta.");
      else setStale(true);
    }
    if (!silent) setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // live: the server tells when a template was created, removed, approved or refused; while one is under review, ask again every 30 s
  useEffect(() => {
    const socket = openSocket();
    socket.on("metaTemplates", () => { if (!quiet.current) load(true); });
    return () => socket.disconnect();
  }, [load]);
  const reviewing = (data?.templates || []).some((t) => t.status === "PENDING" || t.status === "IN_APPEAL");
  useEffect(() => {
    if (!reviewing) return undefined;
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [reviewing, load]);

  const missing = (data?.pack || []).filter((p) => !p.created);
  const sendPack = async () => {
    setSending(true);
    quiet.current = true;
    try {
      const { data: d } = await api.post("/meta/templates/pack");
      const failed = (d.results || []).filter((r) => !/^enviado|^já existe/.test(r.result));
      if (failed.length) toast.warn(`Alguns modelos não foram aceitos: ${failed.map((f) => f.name).join(", ")}. Veja o motivo na lista.`);
      else toast.success("Modelos enviados. A Meta costuma responder em minutos; o status muda aqui sozinho.");
      await load(true);
    } catch (err) { toastError(err); }
    quiet.current = false;
    setSending(false);
  };

  const n = paramsIn(draft.body);
  const examples = useMemo(() => Array.from({ length: n }, (_, i) => draft.examples[i] || ""), [n, draft.examples]);
  const create = async () => {
    setSending(true);
    quiet.current = true;
    try {
      await api.post("/meta/templates", { ...draft, examples, buttons: draft.buttons.filter((b) => b.trim()) });
      toast.success("Modelo enviado para análise da Meta, na categoria Utilidade.");
      setDraft(EMPTY);
      await load(true);
    } catch (err) { toastError(err); }
    quiet.current = false;
    setSending(false);
  };
  const remove = async (name) => {
    if (!window.confirm(`Remover o modelo ${name} da conta da Meta? Isso não pode ser desfeito.`)) return;
    try { await api.delete(`/meta/templates/${name}`); toast.success("Modelo removido."); await load(true); } catch (err) { toastError(err); }
  };

  if (error) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Modelos da Meta</div>
        <div style={hint}>{error} Confira em Conexões se há um número da API oficial com o token salvo e a conta do WhatsApp (WABA) informada.</div>
        <Button size="small" variant="outlined" style={{ marginTop: 10 }} onClick={() => load()} startIcon={<RefreshCw size={14} />}>Tentar de novo</Button>
      </div>
    );
  }
  if (!data) return <div style={hint}><CircularProgress size={14} /> Lendo os modelos na Meta...</div>;

  const departments = data.departments || {};
  const packNames = new Set((data.pack || []).map((p) => p.name));
  const byDept = DEPT_ORDER.map((d) => [d, (data.templates || []).filter((t) => t.department === d)]);
  const others = (data.templates || []).filter((t) => !t.department);

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      {stale && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", borderRadius: 10, background: "rgba(245,158,11,.14)", fontSize: 13 }}>
          <span style={{ flex: "1 1 220px" }}>Não foi possível atualizar agora: a lista pode estar desatualizada.</span>
          <Button size="small" variant="outlined" onClick={() => load()}>Tentar de novo</Button>
        </div>
      )}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, flex: "1 1 220px" }}>Pacote recomendado</div>
          <Button size="small" variant="outlined" onClick={() => load()} disabled={busy} startIcon={<RefreshCw size={14} className={busy ? "ui-spin" : undefined} />}>Atualizar</Button>
          <Button size="small" variant="contained" color="primary" onClick={sendPack} disabled={sending || !missing.length} startIcon={<Send size={14} />}>
            {missing.length ? `Enviar ${missing.length} para a Meta` : "Todos enviados"}
          </Button>
        </div>
        <div style={hint}>
          Modelos por departamento, escritos como aviso para a categoria <b>Utilidade</b> (a mais barata). A Meta pode mudar a categoria por conta própria: quando ela passa um modelo para Marketing, ele aparece marcado aqui, porque cada envio fica mais caro. Quem já está conversando com a equipe não recebe "Olá" de novo: o modelo começa pelo nome e diz o que continua. Os de abertura têm botões de resposta, que reabrem a conversa gratuita de 24 horas. Ao ser aprovado, cada um passa a ser usado sozinho no lugar certo.
        </div>
        <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
          {DEPT_ORDER.map((d) => {
            const items = (data.pack || []).filter((p) => p.department === d);
            if (!items.length) return null;
            return (
              <div key={d} style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".05em" }}>{departments[d] || d}</div>
                {items.map((p) => {
                  const t = (data.templates || []).find((x) => x.name === p.name);
                  return <Row key={p.name} t={{ ...p, status: t?.status, reason: t?.reason }} />;
                })}
              </div>
            );
          })}
        </div>
      </div>

      {values && save && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Em uso</div>
          <div style={hint}>Qual modelo aprovado o sistema usa em cada momento. Os do pacote entram aqui sozinhos quando a Meta aprova.</div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {IN_USE.map(([key, label, params]) => {
              const current = values[key] || "";
              const approved = (data.templates || []).filter((t) => t.status === "APPROVED").map((t) => t.name);
              const options = Array.from(new Set([...approved, ...(current ? [current] : [])]));
              return (
                <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
                    <div style={hint}>{params}</div>
                  </div>
                  <TextField select size="small" variant="outlined" label="Modelo" value={current} onChange={(e) => save(key, e.target.value)} style={{ flex: "1 1 220px", maxWidth: 320 }}>
                    <MenuItem value="">Nenhum (não envia fora das 24 h)</MenuItem>
                    {options.map((o) => <MenuItem key={o} value={o}>{o}{approved.includes(o) ? "" : " (não aprovado)"}</MenuItem>)}
                  </TextField>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Criar modelo</div>
        <div style={hint}>Um aviso sobre algo que a pessoa já tem com a instituição (matrícula, solicitação, documento, boleto, prazo), sem oferta nem desconto: é o que a Meta aceita como Utilidade. Use {"{{1}}"}, {"{{2}}"}... para o que muda de pessoa para pessoa e dê um exemplo de cada.</div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 12, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <TextField select size="small" variant="outlined" label="Departamento" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} style={{ flex: "1 1 180px" }}>
                {DEPT_ORDER.map((d) => <MenuItem key={d} value={d}>{departments[d] || d}</MenuItem>)}
              </TextField>
              <TextField select size="small" variant="outlined" label="Usar em" value={draft.use} onChange={(e) => setDraft({ ...draft, use: e.target.value })} style={{ flex: "1 1 180px" }}>
                {Object.entries(USE).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
              </TextField>
            </div>
            <TextField size="small" variant="outlined" label="Nome (letras minúsculas e _)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            <TextField size="small" variant="outlined" label="Para que serve (só para a equipe)" value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value.slice(0, 120) })} />
            <TextField multiline minRows={3} variant="outlined" label="Texto" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="{{1}}, a sua solicitação sobre o curso {{2}} continua aberta. Para seguir, é só responder." />
            {examples.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {examples.map((ex, i) => (
                  <TextField key={i} size="small" variant="outlined" label={`Exemplo de {{${i + 1}}}`} value={ex} style={{ flex: "1 1 140px" }}
                    onChange={(e) => { const next = [...examples]; next[i] = e.target.value; setDraft({ ...draft, examples: next }); }} />
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {draft.buttons.map((b, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
                  <TextField size="small" variant="outlined" label={`Botão ${i + 1}`} value={b} inputProps={{ maxLength: 25 }} style={{ width: 170 }}
                    onChange={(e) => setDraft({ ...draft, buttons: draft.buttons.map((x, k) => (k === i ? e.target.value : x)) })} />
                  <IconAction title="Remover botão" onClick={() => setDraft({ ...draft, buttons: draft.buttons.filter((_, k) => k !== i) })}><X size={15} /></IconAction>
                </span>
              ))}
              {draft.buttons.length < 3 && <Button size="small" variant="text" color="primary" startIcon={<Plus size={14} />} onClick={() => setDraft({ ...draft, buttons: [...draft.buttons, ""] })}>{draft.buttons.length ? "Outro botão" : "Adicionar botões de resposta"}</Button>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={hint}>Utilidade · português (Brasil)</span>
              <span style={{ flex: 1 }} />
              <Button size="small" variant="contained" color="primary" startIcon={<Send size={14} />} onClick={create}
                disabled={sending || !draft.name.trim() || !draft.body.trim() || examples.some((x) => !x.trim())}>Enviar para análise</Button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Como a pessoa vê</div>
            <Bubble body={draft.body} examples={examples} buttons={draft.buttons} />
            {/^\s*(ol[áa]|oi)\b/i.test(draft.body) && draft.use !== "campanha" && <div style={{ ...hint, color: "#b45309" }}>Quem já conversa com a equipe estranha um "Olá" no meio do processo: comece pelo nome ({"{{1}}"}, ...).</div>}
            {/(desconto|promo|oferta|gr[áa]tis|imperd[íi]vel|últimas vagas)/i.test(draft.body) && <div style={{ ...hint, color: "#b91c1c" }}>Palavras de oferta fazem a Meta recusar como Utilidade.</div>}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Todos os modelos da conta</div>
        <div style={{ display: "grid", gap: 14 }}>
          {byDept.map(([d, items]) => items.length > 0 && (
            <div key={d} style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".05em" }}>{departments[d] || d}</div>
              {items.map((t) => <Row key={`${t.name}-${t.language}`} t={t} onRemove={packNames.has(t.name) ? null : remove} />)}
            </div>
          ))}
          {others.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".05em" }}>Sem departamento (modelos antigos)</div>
              {others.map((t) => <Row key={`${t.name}-${t.language}`} t={t} onRemove={remove} />)}
            </div>
          )}
          {!(data.templates || []).length && <div style={hint}>Nenhum modelo na conta ainda.</div>}
        </div>
        <div style={{ ...hint, marginTop: 8 }}>Para os modelos saírem nas campanhas e na abertura de conversas, o envio também precisa estar autorizado em Operação.</div>
      </div>
    </div>
  );
}
