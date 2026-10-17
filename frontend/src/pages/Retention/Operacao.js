import React, { useEffect, useMemo, useState } from "react";
import { MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import TopLoader from "../../components/TopLoader";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: theme.spacing(1.5), marginBottom: theme.spacing(2) },
    kpi: { border: `1px solid ${line}`, borderRadius: 14, padding: theme.spacing(1.5, 2), background: theme.palette.cards.background },
    big: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5, "& th": { textAlign: "right", fontWeight: 600, padding: "8px 10px", color: theme.palette.text.secondary, borderBottom: `1px solid ${line}`, whiteSpace: "nowrap" }, "& td": { textAlign: "right", padding: "9px 10px", borderBottom: `1px solid ${line}`, fontVariantNumeric: "tabular-nums" }, "& th:first-child, & td:first-child": { textAlign: "left" } },
    scroll: { overflowX: "auto" },
  };
});

const RANGES = [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Último ano"]];
const mins = (m) => (m === null || m === undefined ? "—" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1).replace(".", ",")} h` : `${(m / 1440).toFixed(1).replace(".", ",")} d`);
const hours = (h) => (h === null || h === undefined ? "—" : h < 48 ? `${String(h).replace(".", ",")} h` : `${(h / 24).toFixed(1).replace(".", ",")} dias`);

// The numbers of the operation: what was sent, how many came back, how fast, and what is still to be attended.
const Operacao = () => {
  const classes = useStyles();
  const [range, setRange] = useState("30");
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const period = useMemo(() => {
    const day = (t) => t.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
    const to = new Date();
    return { from: day(new Date(to.getTime() - (Number(range) - 1) * 86400000)), to: day(to) };
  }, [range]);
  useEffect(() => {
    setLoading(true);
    api.get("/retention/operations", { params: period })
      .then(({ data }) => { setMissing(false); setD(data); })
      .catch((err) => { if (err && err.response && err.response.status === 404) setMissing(true); else toastError(err); })
      .finally(() => setLoading(false));
  }, [period]);

  if (missing) return <div className={classes.card}><Typography>Os dados da operação chegam com a próxima atualização do servidor.</Typography></div>;
  if (!d) return <TopLoader active={loading} />;
  const days = [...d.perDay, ...(d.answeredOnlyDays || [])].sort((a, b) => a.day.localeCompare(b.day)).map((x) => ({ ...x, label: `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}` }));
  const s = d.survey;
  return (
    <div>
      <TopLoader active={loading} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <TextField select size="small" variant="outlined" label="Período" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 190 }}>
          {RANGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <Typography className={classes.hint}>O que a área de retenção enviou aos alunos e como foi o retorno.</Typography>
      </div>
      <div className={classes.kpis}>
        <div className={classes.kpi}><div className={classes.hint}>Mensagens enviadas</div><div className={classes.big}>{d.sent.total}</div><div className={classes.hint}>{d.sent.nps} pesquisas · {d.sent.risk} retenção · {d.sent.remat} rematrícula · {d.sent.custom} avulsas</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Pesquisas respondidas</div><div className={classes.big}>{s.answered}<span style={{ fontSize: 15, opacity: 0.6 }}> / {s.sent}</span></div><div className={classes.hint}>{s.responseRate === null ? "sem envios" : `${s.responseRate}% de resposta`}</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Tempo típico de resposta</div><div className={classes.big}>{mins(s.medianAnswerMin)}</div><div className={classes.hint}>mediana, do envio à nota</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Detratores a atender</div><div className={classes.big} style={{ color: s.pending > 0 ? "#dc2626" : "#15803d" }}>{s.pending}</div><div className={classes.hint}>de {s.detractors} no período</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Tempo para atender</div><div className={classes.big}>{hours(s.avgHandleHours)}</div><div className={classes.hint}>{s.handled} atendido{s.handled === 1 ? "" : "s"} (tarefa concluída)</div></div>
        <div className={classes.kpi}><div className={classes.hint}>Alunos em risco agora</div><div className={classes.big} style={{ color: d.atRisk > 0 ? "#c2410c" : undefined }}>{d.atRisk}</div><div className={classes.hint}>sem notícias há tempo</div></div>
      </div>
      {d.sent.failed > 0 && <Typography style={{ color: "#b91c1c", marginBottom: 12 }}>{d.sent.failed} mensagem{d.sent.failed === 1 ? "" : "ns"} não saiu. Veja o motivo na aba Envios.</Typography>}
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Envios e respostas por dia</Typography>
        {days.length < 2 ? <Typography className={classes.hint} style={{ marginTop: 6 }}>O gráfico aparece quando houver envios em pelo menos dois dias.</Typography> : (
          <div style={{ height: 220, marginTop: 8 }}>
            <ResponsiveContainer>
              <ComposedChart data={days} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="sent" name="Enviadas" fill="#0693E3" radius={[4, 4, 0, 0]} animationDuration={1000} animationEasing="ease-out" />
                <Line type="monotone" dataKey="answered" name="Respostas da pesquisa" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} animationDuration={1100} animationEasing="ease-out" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600, marginBottom: 6 }}>Por tutor</Typography>
        <div className={classes.scroll}>
          <table className={classes.table}>
            <thead><tr><th>Tutor</th><th>Enviadas</th><th>Pesquisas</th><th>Respostas</th><th>Taxa</th><th>Detratores</th><th>A atender</th><th>Em risco</th></tr></thead>
            <tbody>
              {d.byTutor.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center" }}>Nenhum envio neste período.</td></tr>}
              {d.byTutor.map((t) => (
                <tr key={t.id || "none"}>
                  <td>{t.name}</td><td>{t.sent}</td><td>{t.surveys}</td><td>{t.answered}</td><td>{t.responseRate === null ? "—" : `${t.responseRate}%`}</td>
                  <td>{t.detractors}</td><td style={{ color: t.pending ? "#dc2626" : undefined, fontWeight: t.pending ? 700 : 400 }}>{t.pending}</td><td>{t.atRisk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Operacao;
