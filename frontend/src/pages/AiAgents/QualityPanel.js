import React, { useEffect, useState } from "react";
import { MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// Quality of the attendance of the agent. Every number was recorded by the system; what could not be measured says so (never an estimate).
const useStyles = makeStyles((theme) => ({
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", marginBottom: theme.spacing(2) },
  card: { borderRadius: 12, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5, 1.75), background: theme.palette.cards.background, minWidth: 0 },
  label: { fontSize: 12.5, color: theme.palette.text.secondary, fontWeight: 600 },
  big: { fontSize: 26, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", marginTop: 2 },
  note: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  bad: { color: "#dc2626" },
  bar: { height: 8, borderRadius: 6, background: theme.palette.action.hover, overflow: "hidden", marginTop: 3 },
  fill: { height: "100%", background: theme.palette.primary.main, borderRadius: 6 },
  li: { fontSize: 13, padding: "4px 0", borderTop: `1px solid ${theme.palette.divider}` },
}));

const nf = (n) => Number(n || 0).toLocaleString("pt-BR");
const mins = (m) => (m === null || m === undefined ? "—" : m < 60 ? `${String(m).replace(".", ",")} min` : `${(Math.round((m / 60) * 10) / 10).toString().replace(".", ",")} h`);

const Card = ({ label, value, note, bad, children }) => {
  const classes = useStyles();
  return (
    <div className={classes.card}>
      <div className={classes.label}>{label}</div>
      <div className={`${classes.big} ${bad ? classes.bad : ""}`}>{value}</div>
      {note ? <div className={classes.note}>{note}</div> : null}
      {children}
    </div>
  );
};

const QualityPanel = ({ agentId }) => {
  const classes = useStyles();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    api.get(`/ai-agents/${agentId}/quality`, { params: { days } }).then(({ data }) => setD(data)).catch(toastError);
  }, [agentId, days]);

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <Typography variant="subtitle1" style={{ fontWeight: 700, flex: 1 }}>Qualidade do atendimento</Typography>
      <TextField select size="small" variant="outlined" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 160 }} aria-label="Período">
        <MenuItem value={7}>Últimos 7 dias</MenuItem>
        <MenuItem value={30}>Últimos 30 dias</MenuItem>
        <MenuItem value={90}>Últimos 90 dias</MenuItem>
      </TextField>
    </div>
  );
  if (!d) return <div>{header}<Typography color="textSecondary" variant="body2">Carregando…</Typography></div>;

  const t = d.timeToHandoff;
  const maxDept = Math.max(1, ...d.byDepartment.map((x) => x.count));
  const errors = d.transferErrors.routingFailed + d.transferErrors.handoffErrors + d.transferErrors.providerErrors;
  const empty = !d.conversations && !d.contactsStarted;
  return (
    <div style={{ marginBottom: 24 }}>
      {header}
      {empty && <Typography variant="body2" color="textSecondary" style={{ marginBottom: 12 }}>O agente ainda não atendeu ninguém neste período. Os números aparecem quando houver conversas.</Typography>}
      <div className={classes.grid}>
        <Card label="Contatos atendidos" value={nf(d.conversations)} note={`${nf(d.contactsStarted)} leads com o primeiro contato feito pelo agente`} />
        <Card label="Leads qualificados" value={nf(d.qualified)} note={d.contactsStarted ? `${Math.round((d.qualified / d.contactsStarted) * 100)}% dos contatos iniciados` : "Sem contatos iniciados"} />
        <Card label="Leads transferidos" value={nf(d.transferred)} note={d.conversations ? `${Math.round((d.transferred / d.conversations) * 100)}% das conversas` : "Sem conversas"} />
        <Card label="Tempo até a transferência" value={mins(t.medianMinutes)} note={t.n ? `Mediana de ${t.n} lead(s); 9 em cada 10 em até ${mins(t.p90Minutes)}` : "Sem transferências medidas no período"} />
        <Card label="Pedidos de humano" value={nf(d.humanRequests)} note="Pessoas que pediram para falar com alguém" />
        <Card label="Informações ausentes" value={nf(d.missingInfo.questions)} note="Perguntas que o agente não pôde confirmar e foram para a equipe">
          {d.missingInfo.topQuestions.slice(0, 3).map((q) => <div key={q.question} className={classes.li}>“{q.question.slice(0, 80)}” <b>×{q.count}</b></div>)}
        </Card>
        <Card label="Transferências com erro" value={nf(errors)} bad={errors > 0} note={`${nf(d.transferErrors.routingFailed)} falha(s) ao rotear · ${nf(d.transferErrors.handoffErrors)} por erro técnico · ${nf(d.transferErrors.providerErrors)} falha(s) do provedor de IA`} />
        <Card label="Sem atendimento depois da transferência" value={nf(d.withoutFollowUp.withoutTeamMessage)} bad={d.withoutFollowUp.withoutTeamMessage > 0} note={d.withoutFollowUp.handoffs ? `de ${nf(d.withoutFollowUp.handoffs)} conversa(s) transferida(s); nenhuma mensagem da equipe depois de 30 minutos` : "Nenhuma transferência para conferir"} />
        <Card label="Mensagens repetidas" value={nf(d.repetitive.messages)} bad={d.repetitive.messages > 0} note={`Texto igual enviado mais de uma vez na mesma conversa (${nf(d.repetitive.conversations)} conversa(s))`} />
        <Card label="Falhas de ferramentas" value={nf(d.toolFailures.total)} bad={d.toolFailures.total > 0} note="Consultas do agente que deram erro (curso, polo, grade...)">
          {d.toolFailures.byTool.slice(0, 3).map((x) => <div key={x.tool} className={classes.li}>{x.tool} <b>×{x.count}</b></div>)}
        </Card>
      </div>
      <div className={classes.card}>
        <div className={classes.label}>Transferências por departamento</div>
        {d.byDepartment.length === 0 && <div className={classes.note}>Nenhuma transferência no período.</div>}
        {d.byDepartment.map((x) => (
          <div key={x.name} style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{x.name}</span><b>{nf(x.count)}</b></div>
            <div className={classes.bar}><div className={classes.fill} style={{ width: `${(x.count / maxDept) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QualityPanel;
