import React, { useEffect, useState } from "react";
import { Typography, LinearProgress, makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  grid: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: theme.spacing(2) },
  card: { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5) },
  big: { fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
  small: { fontSize: 12.5, color: theme.palette.text.secondary },
  bars: { display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: theme.spacing(1, 0.5, 0) },
  bar: { flex: 1, minWidth: 8, borderRadius: "6px 6px 0 0", background: theme.palette.primary.main, position: "relative" },
  cap: { fontSize: 10.5, color: theme.palette.text.secondary, textAlign: "center", marginTop: 2 },
}));

const nf = (n) => Number(n || 0).toLocaleString("pt-BR");

const UsageTab = ({ agentId }) => {
  const classes = useStyles();
  const [u, setU] = useState(null);
  useEffect(() => { api.get(`/ai-agents/${agentId}/usage`, { params: { days: 7 } }).then(({ data }) => setU(data)).catch(toastError); }, [agentId]);
  if (!u) return null;
  const max = Math.max(1, ...u.perDay.map((d) => d.input + d.output));
  const pct = u.cap > 0 ? Math.min(100, (u.today / u.cap) * 100) : 0;
  return (
    <div>
      <div className={classes.grid}>
        <div className={classes.card}><div className={classes.big}>{nf(u.today)}</div><div className={classes.small}>tokens usados hoje</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(u.total.input + u.total.output)}</div><div className={classes.small}>tokens nos últimos {u.days} dias</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(u.conversations)}</div><div className={classes.small}>conversas atendidas</div></div>
        <div className={classes.card}><div className={classes.big}>{nf(u.total.calls)}</div><div className={classes.small}>chamadas ao modelo</div></div>
      </div>
      {u.cap > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <Typography variant="body2" gutterBottom>Limite diário: {nf(u.today)} de {nf(u.cap)} tokens. Ao atingir, o agente passa as conversas para a equipe.</Typography>
          <LinearProgress variant="determinate" value={pct} color={pct > 85 ? "secondary" : "primary"} />
        </div>
      ) : (
        <Typography variant="body2" color="textSecondary" gutterBottom>Sem limite diário. Defina um limite na aba Persona e limites para evitar surpresas.</Typography>
      )}
      <Typography variant="subtitle2" gutterBottom>Tokens por dia</Typography>
      {u.perDay.length === 0 ? (
        <Typography variant="body2" color="textSecondary">Ainda não há uso neste período.</Typography>
      ) : (
        <div className={classes.bars}>
          {u.perDay.map((d) => (
            <div key={d.day} style={{ flex: 1, minWidth: 8 }}>
              <div className={classes.bar} style={{ height: `${Math.max(4, ((d.input + d.output) / max) * 100)}px` }} title={`${d.day}: ${nf(d.input + d.output)} tokens em ${d.calls} chamadas`} />
              <div className={classes.cap}>{d.day.slice(8)}/{d.day.slice(5, 7)}</div>
            </div>
          ))}
        </div>
      )}
      <Typography variant="body2" color="textSecondary" style={{ marginTop: 16 }}>
        {u.costUsd !== null
          ? `Custo estimado no período: US$ ${u.costUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`
          : "Para ver o custo em dólares, informe o preço do modelo em Configurações (chave ai_price_<modelo> = entrada,saída por milhão de tokens)."}{" "}
        O cache do prompt fixo reduz o custo das chamadas seguintes: {nf(u.total.cacheRead)} tokens foram lidos do cache.
      </Typography>
    </div>
  );
};

export default UsageTab;
