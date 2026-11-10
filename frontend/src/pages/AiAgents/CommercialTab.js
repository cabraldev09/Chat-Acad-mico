import React, { useEffect, useState } from "react";
import { MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: theme.spacing(2) },
  card: { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5) },
  big: { fontSize: 24, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" },
  small: { fontSize: 12.5, color: theme.palette.text.secondary },
  title: { fontSize: 14, fontWeight: 700, margin: theme.spacing(2, 0, 1) },
  step: { display: "grid", gridTemplateColumns: "minmax(120px, 210px) 1fr 54px", alignItems: "center", gap: theme.spacing(1), padding: "3px 0", fontSize: 13.5 },
  track: { height: 12, borderRadius: 6, background: theme.palette.action.hover, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 6, background: theme.palette.primary.main },
}));

const nf = (n) => Number(n || 0).toLocaleString("pt-BR");
const WHY = {
  human_request: "Pediram uma pessoa", proposal: "Hora da proposta", qualified: "Qualificado e sem dúvidas", tutoring: "Precisa da tutoria", secretary: "Precisa da secretaria", unknown: "Pergunta sem resposta na base", limit_turns: "Limite de respostas", limit_tokens: "Limite diário de IA", no_reply: "Parou de responder",
  error: "Erro técnico da IA", complaint: "Insatisfação, pagamento ou jurídico", media: "Áudio ou arquivo que a IA não lê", loop: "Repetiu o pedido", objection: "Várias objeções", other: "Outros",
};

// the funnel of the agent cut by polo or by origin: leads that arrived, qualified, ready for the proposal, enrolled and lost
const CutTable = ({ rows, first, classes }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          {[first, "Chegaram", "Qualificados", "Prontos", "Matriculados", "Perdidos"].map((h, i) => <th key={h} style={{ padding: "6px 8px", fontWeight: 600, textAlign: i ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} style={{ borderTop: "1px solid rgba(127,140,160,.25)" }}>
            <td style={{ padding: "6px 8px" }}>{r.label}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{nf(r.received)}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{nf(r.qualified)}{r.qualifiedRate !== null ? <span className={classes.small}> · {r.qualifiedRate}%</span> : null}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{nf(r.ready)}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{nf(r.enrolled)}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{nf(r.lost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// The journey of the leads of this agent (each lead counts once per step) and what the AI spent to get them there
const CommercialTab = ({ agentId }) => {
  const classes = useStyles();
  const [days, setDays] = useState(30);
  const [m, setM] = useState(null);
  const [titles, setTitles] = useState({});

  useEffect(() => {
    api.get(`/ai-agents/${agentId}/commercial-metrics`, { params: { days } }).then(({ data }) => setM(data)).catch(toastError);
  }, [agentId, days]);
  useEffect(() => {
    api.get("/flows", { params: { kind: "agent" } }).then(({ data }) => {
      const f = (data || []).find((x) => x.agentId === agentId);
      return f ? api.get(`/flows/${f.id}`) : null;
    }).then((r) => {
      if (r) setTitles(r.data.graph.nodes.reduce((o, n) => ({ ...o, [n.id]: (n.data && n.data.title) || n.type }), {}));
    }).catch(() => undefined);
  }, [agentId]);

  if (!m) return null;
  const top = Math.max(1, ...m.funnel.map((f) => f.leads));
  const ai = m.ai;
  const rate = (e) => (m.conversion.find((c) => c.event === e) || {}).rate;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Typography variant="body2" color="textSecondary" style={{ flex: 1 }}>
          Cada lead conta uma vez em cada passo. Só entram leads atendidos por este agente.
        </Typography>
        <TextField select size="small" variant="outlined" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 150 }}>
          {[[7, "Últimos 7 dias"], [30, "Últimos 30 dias"], [90, "Últimos 90 dias"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
      </div>

      {m.intake && m.intake.created > 0 && (
        <div className={classes.small} style={{ marginBottom: 12 }}>
          Neste período entraram <b>{nf(m.intake.created)}</b> leads no sistema e o agente atendeu <b>{nf(m.intake.attended)}</b>
          {m.intake.created ? ` (${Math.min(100, Math.round((m.intake.attended / m.intake.created) * 100))}%)` : ""}. Os outros entraram por cadastro, formulário ou afiliado e ainda não escreveram.
        </div>
      )}
      <div className={classes.title} style={{ marginTop: 0 }}>Funil do atendimento</div>
      {m.funnel[0].leads === 0 && <Typography variant="body2" color="textSecondary">Ainda não chegou nenhum lead por este agente neste período.</Typography>}
      {m.funnel.map((f) => (
        <div key={f.event} className={classes.step}>
          <span>{f.label}</span>
          <div className={classes.track}><div className={classes.fill} style={{ width: `${Math.round((f.leads / top) * 100)}%` }} /></div>
          <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{nf(f.leads)}</b>
        </div>
      ))}
      <div className={classes.grid} style={{ marginTop: 12 }}>
        <div className={classes.card}><div className={classes.big}>{rate("qualified") !== undefined ? `${rate("qualified")}%` : "—"}</div><div className={classes.small}>dos leads chegaram a qualificados</div></div>
        <div className={classes.card}><div className={classes.big}>{rate("ready_for_proposal") !== undefined ? `${rate("ready_for_proposal")}%` : "—"}</div><div className={classes.small}>chegaram a prontos para proposta</div></div>
        <div className={classes.card}><div className={classes.big}>{rate("enrolled") !== undefined ? `${rate("enrolled")}%` : "—"}</div><div className={classes.small}>viraram matrícula</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(m.unknownQuestions)}</div><div className={classes.small}>perguntas sem resposta na base</div></div>
      </div>

      {(m.byPoloFunnel || []).length > 0 && (
        <>
          <div className={classes.title}>Por polo</div>
          <CutTable rows={m.byPoloFunnel} first="Polo" classes={classes} />
        </>
      )}
      {(m.bySourceFunnel || []).length > 0 && (
        <>
          <div className={classes.title}>Por origem do lead</div>
          <CutTable rows={m.bySourceFunnel} first="Origem" classes={classes} />
        </>
      )}
      {(m.lostReasons || []).length > 0 && (
        <>
          <div className={classes.title}>Por que perdemos</div>
          {m.lostReasons.map((r) => (
            <div key={r.reason} className={classes.step}>
              <span>{r.reason}</span>
              <div className={classes.track}><div className={classes.fill} style={{ width: `${Math.round((r.count / m.lostReasons[0].count) * 100)}%`, background: "#64748b" }} /></div>
              <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{nf(r.count)}</b>
            </div>
          ))}
        </>
      )}

      <div className={classes.title}>Uso da IA</div>
      <div className={classes.grid}>
        <div className={classes.card}><div className={classes.big}>{nf(ai.conversations)}</div><div className={classes.small}>conversas</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(ai.turns)}</div><div className={classes.small}>respostas do agente</div></div>
        <div className={classes.card}><div className={classes.big}>{ai.deterministicShare}%</div><div className={classes.small}>respondidas pelo sistema, sem IA</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(ai.llmCalls)}</div><div className={classes.small}>chamadas ao modelo</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(ai.toolCalls)}</div><div className={classes.small}>consultas a ferramentas ({nf(ai.cacheHits)} vieram do cache)</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(ai.tokens.total)}</div><div className={classes.small}>tokens ({nf(ai.tokens.input)} entrada · {nf(ai.tokens.output)} saída)</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(ai.tokens.cacheRead)}</div><div className={classes.small}>tokens lidos do cache</div></div>
        <div className={classes.card}><div className={classes.big}>{ai.avgLatencyMs ? `${(ai.avgLatencyMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : "—"}</div><div className={classes.small}>tempo médio da resposta</div></div>
      </div>
      <div className={classes.grid}>
        <div className={classes.card}><div className={classes.big}>{ai.perConversation !== null ? nf(ai.perConversation) : "—"}</div><div className={classes.small}>tokens por conversa</div></div>
        <div className={classes.card}><div className={classes.big}>{ai.perTurn !== null ? nf(ai.perTurn) : "—"}</div><div className={classes.small}>tokens por resposta</div></div>
        <div className={classes.card}><div className={classes.big}>{ai.perQualifiedLead !== null ? nf(ai.perQualifiedLead) : "—"}</div><div className={classes.small}>tokens por lead qualificado</div></div>
        <div className={classes.card}><div className={classes.big}>{ai.perReadyLead !== null ? nf(ai.perReadyLead) : "—"}</div><div className={classes.small}>tokens por lead pronto para proposta</div></div>
        <div className={classes.card}>
          <div className={classes.big}>{ai.costUsd !== null ? `US$ ${ai.costUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"}</div>
          <div className={classes.small}>{ai.costUsd !== null ? `custo no período${ai.costPerConversationUsd !== null ? ` · US$ ${ai.costPerConversationUsd.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} por conversa` : ""}` : `custo: informe o preço de ${ai.model} na aba Uso`}</div>
        </div>
      </div>

      <div className={classes.title}>Transferências para a equipe</div>
      {m.handoffs.total === 0 ? (
        <Typography variant="body2" color="textSecondary">Nenhuma conversa foi passada para uma pessoa neste período.</Typography>
      ) : (
        <>
          <div className={classes.grid}>
            <div className={classes.card}><div className={classes.big}>{nf(m.handoffs.total)}</div><div className={classes.small}>conversas passadas para a equipe</div></div>
            <div className={classes.card}><div className={classes.big}>{m.handoffs.medianMinutes !== null ? `${nf(m.handoffs.medianMinutes)} min` : "—"}</div><div className={classes.small}>tempo típico até uma pessoa responder</div></div>
            <div className={classes.card}><div className={classes.big} style={m.handoffs.unanswered ? { color: "#d97706" } : undefined}>{nf(m.handoffs.unanswered)}</div><div className={classes.small}>ainda sem resposta de uma pessoa</div></div>
          </div>
          {m.handoffs.byReason.map((r) => (
            <div key={r.why} className={classes.step}>
              <span>{WHY[r.why] || r.why}</span>
              <div className={classes.track}><div className={classes.fill} style={{ width: `${Math.round((r.count / m.handoffs.byReason[0].count) * 100)}%`, background: "#ea580c" }} /></div>
              <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{nf(r.count)}</b>
            </div>
          ))}
          {m.handoffs.byPolo.length > 0 && <div className={classes.small} style={{ marginTop: 8 }}>Por polo: {m.handoffs.byPolo.map((p) => `${p.polo} (${p.count})`).join(" · ")}</div>}
        </>
      )}
      {(m.technical.errors > 0 || m.technical.guards > 0) && (
        <div className={classes.small} style={{ marginTop: 8 }}>
          {m.technical.errors > 0 ? `${nf(m.technical.errors)} falha(s) da IA (a conversa foi para a equipe). ` : ""}
          {m.technical.guards > 0 ? `${nf(m.technical.guards)} resposta(s) barradas por trazerem valor, promessa ou dado sem fonte.` : ""}
        </div>
      )}

      {m.byNode.length > 0 && (
        <>
          <div className={classes.title}>Onde a IA gasta mais</div>
          {m.byNode.map((n) => (
            <div key={n.nodeId} className={classes.step}>
              <span>{titles[n.nodeId] || n.nodeId}</span>
              <div className={classes.track}><div className={classes.fill} style={{ width: `${Math.round((n.tokens / Math.max(1, m.byNode[0].tokens)) * 100)}%`, background: "#be185d" }} /></div>
              <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>{nf(n.tokens)}</b>
            </div>
          ))}
          <div className={classes.small}>Tokens por bloco do agente. Respostas do sistema (abertura, pedido de uma pessoa, valor) não gastam nada.</div>
        </>
      )}
    </div>
  );
};

export default CommercialTab;
