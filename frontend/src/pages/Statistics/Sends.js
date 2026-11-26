import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { GlowPanel } from "../../components/peak";
import { num } from "../../components/analytics/kit";

// Estatísticas → Disparos (management): the requests for more sends (approve with how many, or deny), and what each person sent and
// spent in the period (Meta messages + AI calls), with the "Automação" line for what nobody asked for. A person opens their sends.

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "-");
const when = (v) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-");
const STATUS = { draft: "Rascunho", scheduled: "Agendada", running: "Enviando", paused: "Pausada", finished: "Concluída", cancelled: "Cancelada" };
const FILTERS = [["pending", "A aprovar"], ["approved", "Aprovados"], ["denied", "Recusados"]];
const today = () => new Date().toLocaleDateString("en-CA");

const useLoad = (url, params) => {
  const [state, setState] = useState({ data: null, loading: true, error: false });
  const key = JSON.stringify(params || {});
  const load = useCallback(() => {
    let alive = true;
    if (!url) return () => { alive = false; };
    setState((s) => ({ ...s, loading: true, error: false }));
    api.get(url, { params })
      .then(({ data }) => { if (alive) setState({ data, loading: false, error: false }); })
      .catch(() => { if (alive) setState((s) => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  useEffect(() => load(), [load]);
  return { ...state, reload: load };
};

const Requests = ({ onDecided }) => {
  const [status, setStatus] = useState("pending");
  const { data, loading, error, reload } = useLoad("/send-releases", { status });
  const [deciding, setDeciding] = useState(null); // { row, action }
  const [granted, setGranted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = (data && data.rows) || [];
  const open = (row, action) => { setDeciding({ row, action }); setGranted(String(row.requested)); setNote(""); };
  const decide = async () => {
    setBusy(true);
    try {
      await api.put(`/send-releases/${deciding.row.id}`, { action: deciding.action, ...(deciding.action === "approve" ? { granted: Number(granted) } : {}), note });
      toast.success(deciding.action === "approve" ? "Liberação aprovada. A pessoa foi avisada." : "Pedido recusado. A pessoa foi avisada.");
      setDeciding(null);
      reload();
      if (onDecided) onDecided();
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  const validGrant = Number(granted) >= 1 && Number(granted) <= 5000 && Number.isInteger(Number(granted));
  return (
    <GlowPanel
      title="Pedidos de liberação"
      sub={data && data.pending ? `${data.pending} ${data.pending === 1 ? "pedido aguarda" : "pedidos aguardam"} a gestão` : "Quem passou da cota de disparos do mês e pediu mais"}
      loading={loading && !data}
      error={error && !data}
      onRetry={reload}
      action={(
        <div className="snd-filters" role="tablist" aria-label="Situação dos pedidos">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={status === k} className={`snd-chip${status === k ? " is-on" : ""}`} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
      )}
      empty={!rows.length}
      emptyText={status === "pending" ? "Nenhum pedido aguardando." : status === "approved" ? "Nenhum pedido aprovado." : "Nenhum pedido recusado."}
    >
      <div className="snd-cards">
        {rows.map((r) => (
          <article key={r.id} className="snd-card">
            <div className="snd-card__top">
              <strong>{r.userName || `Usuário ${r.userId}`}</strong>
              <span className="snd-card__amount">+{num(r.requested)} {r.requested === 1 ? "mensagem" : "mensagens"}</span>
            </div>
            <p className="snd-card__reason">{r.reason}</p>
            <div className="snd-card__meta">
              {r.context && r.context.name ? <span>{r.context.type === "aviso" ? "Aviso" : "Campanha"}: {r.context.name}{r.context.recipients ? ` (${num(r.context.recipients)} pessoas)` : ""}</span> : null}
              <span>Uso do mês: {num(r.usage.used)} de {num(r.usage.quota + r.usage.extra)}</span>
              <span>Pedido em {when(r.createdAt)}</span>
            </div>
            {r.status === "pending" ? (
              <div className="snd-card__actions">
                <Button size="small" variant="contained" color="primary" onClick={() => open(r, "approve")}>Aprovar</Button>
                <Button size="small" variant="outlined" onClick={() => open(r, "deny")}>Recusar</Button>
              </div>
            ) : (
              <div className="snd-card__meta">
                <span>{r.status === "approved" ? `Aprovado: +${num(r.granted)}` : "Recusado"}{r.decidedBy ? ` por ${r.decidedBy}` : ""} em {when(r.decidedAt)}</span>
                {r.decisionNote ? <span>{r.decisionNote}</span> : null}
              </div>
            )}
          </article>
        ))}
      </div>
      <Dialog open={!!deciding} onClose={busy ? undefined : () => setDeciding(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{deciding && deciding.action === "approve" ? "Aprovar liberação" : "Recusar pedido"}</DialogTitle>
        <DialogContent style={{ display: "grid", gap: 14 }}>
          {deciding && <div style={{ fontSize: 14 }}>{deciding.row.userName} pediu {num(deciding.row.requested)} mensagens a mais neste mês.</div>}
          {deciding && deciding.action === "approve" && (
            <TextField id="release-granted" label="Quantas liberar" type="number" variant="outlined" size="small" value={granted}
              onChange={(e) => { const { value } = e.target; setGranted(value); }} inputProps={{ min: 1, max: 5000, step: 1 }}
              error={!validGrant} helperText={validGrant ? "Vale só para este mês." : "De 1 a 5000."} InputLabelProps={{ shrink: true }} />
          )}
          <TextField id="release-note" label={deciding && deciding.action === "deny" ? "Motivo (a pessoa recebe)" : "Observação (opcional)"} variant="outlined" size="small" multiline minRows={2}
            value={note} onChange={(e) => { const { value } = e.target; setNote(value); }} inputProps={{ maxLength: 300 }} InputLabelProps={{ shrink: true }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeciding(null)} disabled={busy}>Cancelar</Button>
          <Button color="primary" variant="contained" onClick={decide} disabled={busy || (deciding && deciding.action === "approve" && !validGrant)}>
            {busy ? "Salvando..." : deciding && deciding.action === "approve" ? "Aprovar" : "Recusar"}
          </Button>
        </DialogActions>
      </Dialog>
    </GlowPanel>
  );
};

const PersonSends = ({ person, period, onClose }) => {
  const { data, loading, error, reload } = useLoad(person ? `/operations/costs-by-user/${person.userId}/sends` : null, period);
  const rows = data || [];
  return (
    <Dialog open={!!person} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Disparos de {person ? person.name : ""}</DialogTitle>
      <DialogContent>
        {loading && !data && <div className="snd-note" aria-live="polite">Carregando os disparos...</div>}
        {error && !data && <div className="snd-note" role="alert">Não foi possível carregar. <Button size="small" onClick={reload}>Tentar de novo</Button></div>}
        {data && !rows.length && <div className="snd-note">Nenhum disparo criado no período.</div>}
        {rows.length > 0 && (
          <table className="pk-table pk-stack">
            <thead><tr><th>Disparo</th><th>Objetivo</th><th>Criado em</th><th className="r">Receberam</th><th>Situação</th><th className="r">Meta</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-main="1" style={{ fontWeight: 600 }}>{r.name}</td>
                  <td data-label="Objetivo">{r.objective || "Não informado"}</td>
                  <td data-label="Criado em">{day(r.createdAt)}</td>
                  <td className="r" data-label="Receberam">{num(r.sent)} de {num(r.recipients)}</td>
                  <td data-label="Situação">{STATUS[r.status] || r.status}</td>
                  <td className="r" data-label="Meta">US$ {Number(r.metaUsd || 0).toFixed(2).replace(".", ",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
};

export default function Sends({ params }) {
  const period = params && params.from ? { from: params.from, to: params.to } : { from: today(), to: today() };
  const { data, loading, error, reload } = useLoad("/operations/costs-by-user", period);
  const [person, setPerson] = useState(null);
  const rows = (data && data.rows) || [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Requests onDecided={reload} />
      <GlowPanel
        title="Por pessoa"
        sub={data ? `Disparos, mensagens e gasto estimado de ${day(`${data.from}T12:00:00`)} a ${day(`${data.to}T12:00:00`)}. Total: ${brl(data.total.brl)}.` : "Disparos, mensagens e gasto estimado no período"}
        loading={loading && !data}
        error={error && !data}
        onRetry={reload}
        empty={!rows.length}
        emptyText="Nenhum envio nem uso de IA no período."
      >
        <table className="pk-table pk-stack">
          <thead><tr><th>Pessoa</th><th className="r">Disparos</th><th className="r">Mensagens</th><th className="r">Cota do mês</th><th className="r">Meta</th><th className="r">IA</th><th className="r">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId === null ? "auto" : r.userId}>
                <td data-main="1" style={{ fontWeight: 600 }}>
                  {r.automation
                    ? <span title="Respostas automáticas, auditorias e rotinas que ninguém pediu">Automação</span>
                    : <button type="button" className="snd-link" onClick={() => setPerson(r)}>{r.name}</button>}
                </td>
                <td className="r" data-label="Disparos">{num(r.campaigns)}</td>
                <td className="r" data-label="Mensagens">{num(r.meta.messages)}</td>
                <td className="r" data-label="Cota do mês">{r.quota ? `${num(r.quota.used)} de ${num(r.quota.quota + r.quota.extra)}` : "-"}</td>
                <td className="r" data-label="Meta">{brl(r.meta.brl)}</td>
                <td className="r" data-label="IA">{brl(r.ai.brl)}</td>
                <td className="r" data-label="Total" style={{ fontWeight: 600 }}>{brl(r.total.brl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="snd-note">Valores estimados pela tabela da Meta e pelo preço de cada modelo de IA, convertidos pela cotação de Operação e custos. Uma pessoa abre a lista dos disparos dela.</div>
      </GlowPanel>
      <PersonSends person={person} period={period} onClose={() => setPerson(null)} />
    </div>
  );
}
