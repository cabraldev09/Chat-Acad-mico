import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Typography, Chip, CircularProgress } from "@material-ui/core";
import { Play, CheckCheck, MessageSquare } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import IconAction from "../../components/IconAction";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import openSocket from "../../services/socket-io";

const COLUMNS = [
  { key: "pending", title: "Pendentes", hint: "Matriculados aguardando o primeiro contato.", color: "#d97706" },
  { key: "started", title: "Em andamento", hint: "Tutor já falou com o aluno.", color: "#0693E3" },
  { key: "done", title: "Concluídas", hint: "Aluno ambientado na plataforma.", color: "#16a34a" },
];

const useStyles = makeStyles((theme) => ({
  intro: { color: theme.palette.text.secondary, fontSize: 14, margin: theme.spacing(0, 0, 2) },
  board: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start", paddingBottom: theme.spacing(3) },
  col: { borderRadius: 16, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, padding: theme.spacing(1.5), minWidth: 0 },
  colHead: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(0.5, 0.5, 0.25) },
  dot: { width: 10, height: 10, borderRadius: "50%", flex: "none" },
  colTitle: { fontWeight: 700, fontSize: 15, flex: 1 },
  colHint: { fontSize: 12.5, color: theme.palette.text.secondary, padding: theme.spacing(0, 0.5, 1.25) },
  card: { borderRadius: 12, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.25, 1.5), marginTop: theme.spacing(1), display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", alignItems: "center", gap: theme.spacing(0.5) },
  name: { fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { fontSize: 12.5, color: theme.palette.text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  late: { color: "#dc2626", fontWeight: 600 },
  empty: { textAlign: "center", color: theme.palette.text.secondary, fontSize: 13, padding: theme.spacing(3, 1) },
}));

const since = (iso) => {
  if (!iso) return "";
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5));
  if (h < 1) return "há poucos minutos";
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
};

// Tutors and coordination follow every enrolled student until the first access is done.
const Onboarding = () => {
  const classes = useStyles();
  const history = useHistory();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/onboarding");
      setRows(data);
    } catch (err) {
      toastError(err);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = openSocket();
    socket.on("lead", load);
    socket.on("onboardingAlert", load);
    return () => socket.disconnect();
  }, [load]);

  const act = async (lead, action) => {
    setBusyId(lead.id);
    try {
      await api.post(`/leads/${lead.id}/onboarding`, { action });
      toast.success(action === "start" ? "Ambientação iniciada." : "Ambientação concluída. O consultor foi avisado para pedir indicação.");
      await load();
    } catch (err) {
      toastError(err);
    }
    setBusyId(null);
  };

  if (!rows) return <MainContainer><div className={classes.empty}><CircularProgress size={24} /></div></MainContainer>;

  return (
    <MainContainer>
      <MainHeader><Title>Ambientação</Title></MainHeader>
      <p className={classes.intro}>
        Alunos com matrícula confirmada. O tutor combina o primeiro acesso à plataforma e marca cada etapa; ao concluir, o consultor recebe lembretes para pedir indicação e oferecer um novo curso.
      </p>
      <div className={classes.board}>
        {COLUMNS.map((col) => {
          const items = rows.filter((r) => r.onboardingStatus === col.key);
          return (
            <section key={col.key} className={classes.col}>
              <div className={classes.colHead}>
                <span className={classes.dot} style={{ background: col.color }} />
                <span className={classes.colTitle}>{col.title}</span>
                <Chip size="small" label={items.length} />
              </div>
              <div className={classes.colHint}>{col.hint}</div>
              {items.length === 0 && <div className={classes.empty}>Nenhum aluno aqui.</div>}
              {items.map((l) => {
                const late = col.key === "pending" && l.enrolledAt && Date.now() - new Date(l.enrolledAt).getTime() > 24 * 36e5;
                return (
                  <div key={l.id} className={classes.card}>
                    <div className={classes.row}>
                      <span className={classes.name} title={l.name}>{l.name}</span>
                      {l.ticketId && (
                        <IconAction title="Abrir a conversa" onClick={() => history.push(`/tickets/${l.ticketId}`)}>
                          <MessageSquare size={16} />
                        </IconAction>
                      )}
                      {col.key === "pending" && (
                        <IconAction title="Iniciar ambientação" disabled={busyId === l.id} onClick={() => act(l, "start")}>
                          <Play size={16} />
                        </IconAction>
                      )}
                      {col.key !== "done" && (
                        <IconAction title="Concluir ambientação" disabled={busyId === l.id} onClick={() => act(l, "done")}>
                          <CheckCheck size={16} />
                        </IconAction>
                      )}
                    </div>
                    <div className={classes.meta}>{l.course ? l.course.name : "Curso não informado"}</div>
                    <div className={classes.meta}>Tutor: {l.tutorName || "aguardando na fila"}{l.owner ? ` · Consultor: ${l.owner.name}` : ""}</div>
                    <div className={`${classes.meta} ${late ? classes.late : ""}`}>
                      {col.key === "done" ? `Concluída ${since(l.onboardingDoneAt)}` : `Matriculado ${since(l.enrolledAt)}${late ? " · prazo vencido" : ""}`}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <Typography variant="caption" color="textSecondary">O sistema avisa quando um aluno passa de 24 horas sem o primeiro contato do tutor.</Typography>
    </MainContainer>
  );
};

export default Onboarding;
