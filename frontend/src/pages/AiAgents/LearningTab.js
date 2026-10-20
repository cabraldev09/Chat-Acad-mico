import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, TextField, Typography, Chip, FormControlLabel, Switch, makeStyles } from "@material-ui/core";
import { Check, X, Lightbulb } from "lucide-react";

import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  intro: { fontSize: 13.5, color: theme.palette.text.secondary, marginBottom: theme.spacing(1.5) },
  filters: { display: "flex", gap: theme.spacing(0.75), flexWrap: "wrap", marginBottom: theme.spacing(1.5) },
  card: { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5), marginBottom: theme.spacing(1.25) },
  who: { fontSize: 12.5, color: theme.palette.text.secondary, marginBottom: 4 },
  actions: { display: "flex", gap: theme.spacing(1), alignItems: "center", flexWrap: "wrap", marginTop: theme.spacing(0.5) },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(4, 1), fontSize: 14 },
}));

const FILTERS = [
  ["para_revisar", "Para revisar"],
  ["aguardando_equipe", "Aguardando a equipe"],
  ["aprovada", "Aprendidas"],
  ["descartada", "Descartadas"],
];

// What the agent did not know, and what the team answered. Nothing is learned until the owner approves it.
const LearningTab = ({ agentId, onCount, initialFilter = "para_revisar" }) => {
  const classes = useStyles();
  const [filter, setFilter] = useState(initialFilter);
  const [data, setData] = useState({ counts: {}, rows: [] });
  const [edits, setEdits] = useState({});
  const [faq, setFaq] = useState({});

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(`/ai-agents/${agentId}/learnings`);
      setData(d);
      onCount && onCount(d.counts.para_revisar || 0);
    } catch (err) { toastError(err); }
  }, [agentId, onCount]);

  useEffect(() => {
    load();
    const socket = openSocket();
    socket.on("aiLearning", load);
    return () => socket.disconnect();
  }, [load]);

  const field = (r, k) => (edits[r.id] && edits[r.id][k] !== undefined ? edits[r.id][k] : r[k] || "");
  const edit = (r, k, v) => setEdits((cur) => ({ ...cur, [r.id]: { ...cur[r.id], [k]: v } }));

  const approve = async (r) => {
    try {
      await api.post(`/ai-learnings/${r.id}/approve`, { question: field(r, "question"), answer: field(r, "suggestedAnswer"), asFaq: !!faq[r.id] });
      toast.success("Pronto: o agente aprendeu.");
      load();
    } catch (err) { toastError(err); }
  };
  const discard = async (r) => {
    try { await api.post(`/ai-learnings/${r.id}/discard`); load(); } catch (err) { toastError(err); }
  };

  const rows = data.rows.filter((r) => r.status === filter);
  return (
    <div>
      <Typography className={classes.intro}>
        Quando o agente não sabe responder, ele avisa o aluno que vai confirmar, guarda a pergunta e passa a conversa para a equipe. A resposta que a equipe der aparece aqui. Se você aprovar, o agente passa a usar. Se o número de avisos estiver preenchido na aba Persona e limites, você também recebe tudo isso no WhatsApp.
      </Typography>
      <div className={classes.filters}>
        {FILTERS.map(([key, label]) => (
          <Chip key={key} clickable color={filter === key ? "primary" : "default"} variant={filter === key ? "default" : "outlined"} onClick={() => setFilter(key)} label={`${label} (${data.counts[key] || 0})`} />
        ))}
      </div>
      {rows.length === 0 && (
        <div className={classes.empty}>
          <Lightbulb size={22} style={{ marginBottom: 6 }} />
          <div>{filter === "para_revisar" ? "Nada para revisar agora. Quando a equipe responder uma dúvida que o agente não soube, ela aparece aqui." : "Nada nesta lista."}</div>
        </div>
      )}
      {rows.map((r) => {
        const editable = r.status === "para_revisar" || r.status === "aguardando_equipe";
        return (
          <div key={r.id} className={classes.card}>
            <div className={classes.who}>{r.contactName ? `Pergunta de ${r.contactName}` : "Pergunta de um aluno"} · {new Date(r.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{r.answerSource === "equipe" ? " · resposta da equipe" : r.answerSource === "dono" ? " · resposta sua" : ""}</div>
            <TextField fullWidth variant="outlined" margin="dense" label="Pergunta" value={field(r, "question")} onChange={(e) => edit(r, "question", e.target.value)} disabled={!editable} />
            <TextField fullWidth multiline rows={3} variant="outlined" margin="dense" label={r.status === "aguardando_equipe" ? "Resposta (a equipe ainda não respondeu: você pode escrever)" : "Resposta que o agente vai usar"} value={field(r, "suggestedAnswer")} onChange={(e) => edit(r, "suggestedAnswer", e.target.value)} disabled={!editable && r.status !== "aprovada"} InputProps={{ readOnly: r.status === "aprovada" || r.status === "descartada" }} />
            {editable && (
              <div className={classes.actions}>
                <Button variant="contained" color="primary" size="small" startIcon={<Check size={15} />} disabled={!field(r, "suggestedAnswer").trim()} onClick={() => approve(r)}>Aprovar e ensinar</Button>
                <Button variant="outlined" size="small" startIcon={<X size={15} />} onClick={() => discard(r)}>Descartar</Button>
                <FormControlLabel control={<Switch size="small" color="primary" checked={!!faq[r.id]} onChange={(e) => setFaq({ ...faq, [r.id]: e.target.checked })} />} label={faq[r.id] ? "Responder sempre com este texto" : "O agente usa como conhecimento"} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LearningTab;
