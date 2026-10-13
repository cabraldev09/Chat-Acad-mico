import React, { useCallback, useEffect, useState } from "react";
import { Paper, Tabs, Tab, Checkbox, Typography, makeStyles, FormControlLabel, Switch } from "@material-ui/core";
import { useHistory } from "react-router-dom";
import { format, parseISO } from "date-fns";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isOverdue } from "./shared";

const useStyles = makeStyles((theme) => ({
  list: { flex: 1, overflowY: "auto", overflowX: "hidden", marginTop: theme.spacing(1.5), ...theme.scrollbarStyles },
  row: {
    display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(1, 1.5), borderBottom: theme.border.divider,
    animation: "page-in .3s var(--ease-out) both", "&:hover": { background: theme.palette.action.hover },
  },
}));

const TYPES = { ligar: "Ligar", whatsapp: "WhatsApp", email: "E-mail", visita: "Visita", proposta: "Proposta", documentos: "Documentos", outro: "Outro" };
const TABS = [["overdue", "Atrasadas"], ["today", "Hoje"], ["open", "Todas abertas"], ["done", "Concluídas"]];

const Tasks = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = React.useContext(AuthContext);
  const [tab, setTab] = useState(0);
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState([]);

  const load = useCallback(() => {
    api.get("/lead-tasks", { params: { status: TABS[tab][0], scope: all ? "all" : "mine" } })
      .then(({ data }) => setRows(data)).catch(toastError);
  }, [tab, all]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (t) => {
    await api.post(`/leads/${t.leadId}/tasks/${t.id}/toggle`);
    load();
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Tarefas de acompanhamento</Title>
        <MainHeaderButtonsWrapper>
          <FormControlLabel control={<Switch color="primary" checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Mostrar de todos" />
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper variant="outlined" style={{ marginBottom: 8 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>{TABS.map(([k, l]) => (<Tab key={k} label={l} />))}</Tabs>
      </Paper>
      <Paper variant="outlined" className={classes.list}>
        {rows.length === 0 && (
          <Typography align="center" color="textSecondary" style={{ padding: 40 }}>
            {tab === 3 ? "Nenhuma tarefa concluída ainda." : "Tudo em dia por aqui. Agende o próximo contato direto na ficha do lead."}
          </Typography>
        )}
        {rows.map((t) => (
          <div key={t.id} className={classes.row}>
            <Checkbox color="primary" checked={!!t.doneAt} onChange={() => toggle(t)} />
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => history.push(`/crm?lead=${t.leadId}`)}>
              <div style={{ fontWeight: 500, textDecoration: t.doneAt ? "line-through" : "none" }}>{t.title}</div>
              <div style={{ fontSize: 12.5, opacity: 0.75 }}>{t.lead ? t.lead.name : ""}{t.lead && t.lead.stage ? ` · ${t.lead.stage.name}` : ""}</div>
            </div>
            <span style={{ fontSize: 12.5, opacity: 0.75 }}>{TYPES[t.type]}</span>
            <span style={{ fontSize: 13, minWidth: 110, textAlign: "right", color: !t.doneAt && isOverdue(t.dueAt) ? "#dc2626" : undefined, fontWeight: !t.doneAt && isOverdue(t.dueAt) ? 600 : 400 }}>
              {format(parseISO(t.dueAt), "dd/MM HH:mm")}
            </span>
            {all && t.user && <span style={{ fontSize: 12.5, opacity: 0.7, minWidth: 80 }}>{t.user.name}</span>}
          </div>
        ))}
      </Paper>
    </MainContainer>
  );
};

export default Tasks;
