import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, TextField } from "@material-ui/core";
import { RefreshCw, Send, Plus } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Configurações → Modelos da Meta: the templates of the official WhatsApp account with their status, the recommended pack (all Utility,
// the cheapest category) and a form for a new one. Every template goes as Utility with "no category change": if the Meta judges it as
// Marketing it refuses it, and it is never charged as Marketing. Once approved, the pack templates take their place by themselves.
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, boxShadow: "var(--shadow-card)", minWidth: 0 };
const hint = { fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 };

const STATUS = {
  APPROVED: ["Aprovado", "#15803d"],
  PENDING: ["Em análise", "#b45309"],
  IN_APPEAL: ["Em recurso", "#b45309"],
  REJECTED: ["Recusado", "#b91c1c"],
  PAUSED: ["Pausado", "#b91c1c"],
  DISABLED: ["Desativado", "#b91c1c"],
};
const CATEGORY = { UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação" };

const Badge = ({ status }) => {
  const [label, color] = STATUS[status] || [status || "Não enviado", "var(--text-2)"];
  return <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>{label}</span>;
};

// one template: name and status on top (always visible, also on the phone), what it is for, and its text
const Row = ({ name, status, reason, title, body }) => (
  <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, wordBreak: "break-all", flex: "1 1 160px" }}>{name}</span>
      <Badge status={status} />
    </div>
    {title && <div style={{ fontSize: 13, marginTop: 4 }}>{title}</div>}
    {reason && <div style={{ fontSize: 12.5, color: "#b91c1c", marginTop: 2 }}>Motivo da Meta: {reason}</div>}
    {body && <div style={{ ...hint, marginTop: 4, overflowWrap: "anywhere" }}>{body}</div>}
  </div>
);

const paramsIn = (body) => {
  const nums = (String(body || "").match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.replace(/\D/g, "")));
  return nums.length ? Math.max(...nums) : 0;
};

export default function MetaTemplates() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ name: "", body: "", examples: [] });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data: d } = await api.get("/meta/templates");
      setData(d);
      setError("");
      if (d.linked && d.linked.length) toast.success(`Aprovado e já em uso: ${d.linked.join(", ")}.`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.message || "Não foi possível ler os modelos na Meta.");
    }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const missing = (data?.pack || []).filter((p) => !p.created);
  const sendPack = async () => {
    setSending(true);
    try {
      const { data: d } = await api.post("/meta/templates/pack");
      const failed = (d.results || []).filter((r) => !/^enviado|^já existe/.test(r.result));
      if (failed.length) toast.warn(`Alguns modelos não foram aceitos: ${failed.map((f) => f.name).join(", ")}. Veja o motivo na lista.`);
      else toast.success("Modelos enviados. A Meta costuma responder em minutos; o status aparece aqui.");
      await load();
    } catch (err) { toastError(err); }
    setSending(false);
  };

  const n = paramsIn(draft.body);
  const examples = useMemo(() => Array.from({ length: n }, (_, i) => draft.examples[i] || ""), [n, draft.examples]);
  const create = async () => {
    setSending(true);
    try {
      await api.post("/meta/templates", { name: draft.name, body: draft.body, examples });
      toast.success("Modelo enviado para análise da Meta, na categoria Utilidade.");
      setDraft({ name: "", body: "", examples: [] });
      await load();
    } catch (err) { toastError(err); }
    setSending(false);
  };

  if (error) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Modelos da Meta</div>
        <div style={hint}>{error} Confira em Conexões se há um número da API oficial com o token salvo e a conta do WhatsApp (WABA) informada.</div>
        <Button size="small" variant="outlined" style={{ marginTop: 10 }} onClick={load} startIcon={<RefreshCw size={14} />}>Tentar de novo</Button>
      </div>
    );
  }
  if (!data) return <div style={hint}><CircularProgress size={14} /> Lendo os modelos na Meta...</div>;

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, flex: "1 1 220px" }}>Pacote recomendado</div>
          <Button size="small" variant="outlined" onClick={load} disabled={busy} startIcon={<RefreshCw size={14} className={busy ? "ui-spin" : undefined} />}>Atualizar status</Button>
          <Button size="small" variant="contained" color="primary" onClick={sendPack} disabled={sending || !missing.length} startIcon={<Send size={14} />}>
            {missing.length ? `Enviar ${missing.length} para a Meta` : "Todos enviados"}
          </Button>
        </div>
        <div style={hint}>Todos na categoria <b>Utilidade</b> (a mais barata) e protegidos: a Meta não pode mudá-los para Marketing; se discordar, recusa e nada é cobrado como Marketing. Assim que um é aprovado, ele passa a ser usado sozinho onde faz sentido (abertura do atendimento, da tutoria e boas-vindas da matrícula).</div>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {data.pack.map((p) => {
            const t = data.templates.find((x) => x.name === p.name);
            return <Row key={p.name} name={p.name} status={t?.status} reason={t?.reason} title={p.purpose} body={p.body} />;
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Criar modelo</div>
        <div style={hint}>Escreva um aviso sobre algo que a pessoa já tem com a instituição (matrícula, solicitação, boleto, prazo), sem oferta nem desconto: é o que a Meta aceita como Utilidade. Use {"{{1}}"}, {"{{2}}"}... para o que muda de pessoa para pessoa e dê um exemplo de cada.</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <TextField size="small" variant="outlined" label="Nome (letras minúsculas e _)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} style={{ maxWidth: 360 }} />
          <TextField multiline rows={3} variant="outlined" label="Texto" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Olá, {{1}}! A sua solicitação sobre o curso {{2}} continua aberta..." />
          {examples.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {examples.map((ex, i) => (
                <TextField key={i} size="small" variant="outlined" label={`Exemplo de {{${i + 1}}}`} value={ex} style={{ flex: "1 1 160px" }}
                  onChange={(e) => { const next = [...examples]; next[i] = e.target.value; setDraft({ ...draft, examples: next }); }} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={hint}>Categoria: <b>Utilidade</b> · Idioma: português (Brasil)</span>
            <span style={{ flex: 1 }} />
            <Button size="small" variant="contained" color="primary" startIcon={<Plus size={14} />} onClick={create}
              disabled={sending || !draft.name.trim() || !draft.body.trim() || examples.some((x) => !x.trim())}>Enviar para análise</Button>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Todos os modelos da conta</div>
        <div style={{ display: "grid", gap: 8 }}>
          {data.templates.map((t) => (
            <Row key={`${t.name}-${t.language}`} name={t.name} status={t.status} reason={t.reason} title={CATEGORY[t.category] || t.category} body={t.body} />
          ))}
          {!data.templates.length && <div style={hint}>Nenhum modelo na conta ainda.</div>}
        </div>
        <div style={{ ...hint, marginTop: 8 }}>Para os modelos saírem nas campanhas e na abertura de conversas, o envio também precisa estar autorizado em Operação e custos.</div>
      </div>
    </div>
  );
}
