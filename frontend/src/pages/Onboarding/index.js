import React, { useCallback, useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Typography, Chip, CircularProgress, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, ListItemIcon, Checkbox, FormControlLabel } from "@material-ui/core";
import { Play, CheckCheck, MessageSquare, MoreVertical, UserCog, UserCheck, Undo2, MoveRight, ListChecks, Send, BarChart3 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import IconAction from "../../components/IconAction";
import { AuthContext } from "../../context/Auth/AuthContext";
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
  panel: { border: `1px solid ${theme.palette.divider}`, borderRadius: 14, padding: theme.spacing(1.5, 2), margin: theme.spacing(0, 0, 2) },
  stats: { display: "grid", gap: theme.spacing(1.5), gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", "& div": { display: "flex", flexDirection: "column" }, "& b": { fontSize: 22, lineHeight: 1.2 }, "& span": { fontSize: 12.5, color: theme.palette.text.secondary } },
  weeks: { display: "flex", alignItems: "flex-end", gap: 8, height: 90, margin: theme.spacing(1.5, 0, 0.5), "& > div": { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, fontSize: 12 } },
  bar: { width: "100%", maxWidth: 28, borderRadius: 6, background: theme.palette.primary.main },
  table: { width: "100%", borderCollapse: "collapse", marginTop: theme.spacing(1.5), fontSize: 13.5, "& th": { textAlign: "left", fontWeight: 600, padding: "6px 8px", borderBottom: `1px solid ${theme.palette.divider}` }, "& td": { padding: "6px 8px", borderBottom: `1px solid ${theme.palette.divider}` } },
  filters: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap", margin: theme.spacing(0, 0, 2) },
  empty: { textAlign: "center", color: theme.palette.text.secondary, fontSize: 13, padding: theme.spacing(3, 1) },
}));

const SLA_MS = 24 * 36e5;
const isLate = (r) => r.onboardingStatus === "pending" && r.enrolledAt && Date.now() - new Date(r.enrolledAt).getTime() > SLA_MS;
const FILTERS = {
  all: () => true,
  mine: (r, me) => !!me && r.onboardingTutorId === me.id,
  free: (r) => !r.onboardingTutorId && r.onboardingStatus !== "done",
  late: (r) => !!isLate(r),
  replied: (r) => r.unread > 0 && r.onboardingStatus !== "done",
};
const FILTER_LABELS = [["all", "Todos"], ["mine", "Meus alunos"], ["free", "Sem tutor"], ["late", "Atrasados"], ["replied", "Aluno respondeu"]];
const STEPS = [
  { key: "first_access", label: "Primeiro acesso à plataforma" },
  { key: "ava", label: "Ambiente virtual (AVA) apresentado" },
  { key: "polo_contacts", label: "Contatos do polo e da tutoria passados" },
  { key: "documents", label: "Documentos da matrícula conferidos" },
];
const hoursText = (h) => (h === null || h === undefined ? "—" : h < 1 ? "menos de 1 h" : h < 48 ? `${String(h).replace(".", ",")} h` : `${Math.round(h / 24)} dias`);

const since = (iso) => {
  if (!iso) return "";
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5));
  if (h < 1) return "há poucos minutos";
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
};

// Tutors and coordination follow every enrolled student until the first access is done.
const Onboarding = () => {
  const { user: me } = useContext(AuthContext);
  // the conversation of a student in tutoring is the tutor's (and the coordination's), not the consultant's
  const canOpenChat = !!me && me.role !== "consultor";
  const isTutor = !!me && (me.role === "tutor" || me.role === "academico");
  const classes = useStyles();
  const history = useHistory();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [menu, setMenu] = useState(null); // { anchor, lead }
  const [tutorFor, setTutorFor] = useState(null); // { lead, tutors, pick }
  const [filter, setFilter] = useState("all"); // all | mine | free | late | replied
  const [checklistFor, setChecklistFor] = useState(null); // lead id
  const [welcomeFor, setWelcomeFor] = useState(null); // { lead, text, blocked }
  const [stats, setStats] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const isManager = !!me && (me.profile === "admin" || me.role === "admin" || me.role === "coordenacao");

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
      const { data } = await api.post(`/leads/${lead.id}/onboarding`, { action });
      toast.success(action === "start" ? "Ambientação iniciada." : "Ambientação concluída. O consultor foi avisado para pedir indicação.");
      await load();
      // starting takes the student and opens the conversation, so the tutor can greet right away
      if (action === "start" && canOpenChat && data && data.ticketId) history.push(`/tickets/${data.ticketId}`);
    } catch (err) {
      toastError(err);
    }
    setBusyId(null);
  };

  // a confirmed enrollment can still be edited: put the student back to another step, or change the tutor
  const edit = async (lead, body, ok) => {
    setBusyId(lead.id);
    try {
      await api.put(`/leads/${lead.id}/onboarding`, body);
      toast.success(ok);
      await load();
    } catch (err) {
      toastError(err);
    }
    setBusyId(null);
  };
  const toggleStep = async (lead, key, done) => {
    try {
      const { data } = await api.put(`/leads/${lead.id}/onboarding/checklist`, { key, done });
      setRows((rs) => rs.map((r) => (r.id === lead.id ? { ...r, checklist: data.checklist } : r)));
    } catch (err) { toastError(err); }
  };

  // the greeting the administration wrote, ready to be edited and sent from the card (taking the student first when nobody has)
  const openWelcome = async (lead) => {
    if (!lead.ticketId) { toast.info("Este aluno ainda não tem a conversa de ambientação."); return; }
    try {
      const { data } = await api.get(`/tickets/${lead.ticketId}/welcome`);
      setWelcomeFor({ lead, text: data.text || "", blocked: !data.show });
    } catch (err) { toastError(err); }
  };
  const sendWelcome = async () => {
    const { lead, text } = welcomeFor;
    if (!text.trim()) return;
    setBusyId(lead.id);
    try {
      if (isTutor && !lead.onboardingTutorId) await api.put(`/leads/${lead.id}/onboarding`, { tutorId: me.id });
      await api.post(`/messages/${lead.ticketId}`, { body: text.trim() });
      if (lead.onboardingStatus === "pending") await api.post(`/leads/${lead.id}/onboarding`, { action: "start" });
      toast.success("Boas-vindas enviadas.");
      setWelcomeFor(null);
      await load();
    } catch (err) { toastError(err); }
    setBusyId(null);
  };
  useEffect(() => {
    if (!showStats || stats) return;
    api.get("/onboarding/stats").then(({ data }) => setStats(data)).catch(toastError);
  }, [showStats, stats]);

  // a student nobody took yet: the tutor takes it and goes to the conversation
  const take = async (lead) => {
    setBusyId(lead.id);
    try {
      await api.put(`/leads/${lead.id}/onboarding`, { tutorId: me.id });
      toast.success("Você assumiu este aluno. A conversa está na sua lista.");
      await load();
      if (lead.ticketId) history.push(`/tickets/${lead.ticketId}`);
    } catch (err) {
      toastError(err);
    }
    setBusyId(null);
  };
  const openTutor = async (lead) => {
    setMenu(null);
    let tutors = [];
    try { tutors = (await api.get(`/polos/${lead.poloId || 0}/tutors`)).data; } catch (err) { toastError(err); }
    setTutorFor({ lead, tutors, pick: lead.onboardingTutorId || 0 });
  };
  const saveTutor = async () => {
    const { lead, pick } = tutorFor;
    setTutorFor(null);
    await edit(lead, { tutorId: pick === "auto" ? "auto" : pick || null }, pick ? "Tutor atualizado. A conversa foi para ele." : "Aluno devolvido para a fila da tutoria.");
  };

  if (!rows) return <MainContainer><div className={classes.empty}><CircularProgress size={24} /></div></MainContainer>;

  return (
    <MainContainer>
      <MainHeader>
        <Title>Ambientação</Title>
        {isManager && <Button size="small" variant="outlined" startIcon={<BarChart3 size={15} />} onClick={() => setShowStats((v) => !v)}>{showStats ? "Esconder painel" : "Painel do tutor"}</Button>}
      </MainHeader>
      <p className={classes.intro}>
        Alunos com matrícula confirmada. O tutor combina o primeiro acesso à plataforma e marca cada etapa; ao concluir, o consultor recebe lembretes para pedir indicação e oferecer um novo curso.
      </p>
      {showStats && (
        <div className={classes.panel}>
          {!stats ? <CircularProgress size={20} /> : (
            <>
              <div className={classes.stats}>
                <div><b>{hoursText(stats.avgFirstContactHours)}</b><span>tempo médio até o primeiro contato (90 dias)</span></div>
                <div><b>{stats.withinSlaShare === null ? "—" : `${stats.withinSlaShare}%`}</b><span>iniciados dentro de {stats.slaHours} h</span></div>
                <div><b style={stats.totals.late ? { color: "#dc2626" } : undefined}>{stats.totals.late}</b><span>atrasados agora</span></div>
                <div><b>{stats.totals.withoutTutor}</b><span>sem tutor</span></div>
                <div><b>{stats.totals.done}</b><span>concluídos no total</span></div>
              </div>
              <div className={classes.weeks}>
                {stats.weeks.map((w) => (
                  <div key={w.weekStart} title={`Semana de ${w.weekStart.split("-").reverse().join("/")}: ${w.done} concluído(s)`}>
                    <div className={classes.bar} style={{ height: 6 + w.done * 10 }} />
                    <span>{w.done}</span>
                  </div>
                ))}
              </div>
              <div className={classes.meta}>Alunos ambientados por semana (últimas 8 semanas).</div>
              {stats.byTutor.length > 0 && (
                <table className={classes.table}>
                  <thead><tr><th>Tutor</th><th>Em curso</th><th>Atrasados</th><th>Concluídos (30 dias)</th><th>1º contato</th></tr></thead>
                  <tbody>{stats.byTutor.map((t) => <tr key={t.tutorId}><td>{t.name}</td><td>{t.active}</td><td style={t.late ? { color: "#dc2626", fontWeight: 600 } : undefined}>{t.late}</td><td>{t.doneLast30}</td><td>{hoursText(t.avgFirstContactHours)}</td></tr>)}</tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
      <div className={classes.filters}>
        {FILTER_LABELS.map(([k, label]) => {
          const n = rows.filter((r) => FILTERS[k](r, me)).length;
          return <Chip key={k} size="small" clickable label={`${label} (${n})`} color={filter === k ? "primary" : "default"} style={k === "late" && n > 0 && filter !== k ? { background: "#fee2e2", color: "#b91c1c" } : undefined} onClick={() => setFilter(k)} />;
        })}
      </div>
      <div className={classes.board}>
        {COLUMNS.map((col) => {
          // the ones waiting longest come first; the finished ones, the most recent
          const items = rows
            .filter((r) => r.onboardingStatus === col.key && FILTERS[filter](r, me))
            .sort((a, b) => (col.key === "done" ? new Date(b.onboardingDoneAt || 0) - new Date(a.onboardingDoneAt || 0) : new Date(a.enrolledAt || 0) - new Date(b.enrolledAt || 0)));
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
                      {l.ticketId && canOpenChat && (
                        <IconAction title="Abrir a conversa" onClick={() => history.push(`/tickets/${l.ticketId}`)}>
                          <MessageSquare size={16} />
                        </IconAction>
                      )}
                      {l.ticketId && canOpenChat && col.key !== "done" && (
                        <IconAction title="Enviar boas-vindas" disabled={busyId === l.id} onClick={() => openWelcome(l)}>
                          <Send size={16} />
                        </IconAction>
                      )}
                      <IconAction title="Checklist da ambientação" onClick={() => setChecklistFor(l.id)}>
                        <ListChecks size={16} />
                      </IconAction>
                      {isTutor && !l.onboardingTutorId && col.key !== "done" && (
                        <IconAction title="Assumir este aluno" disabled={busyId === l.id} onClick={() => take(l)}>
                          <UserCheck size={16} />
                        </IconAction>
                      )}
                      {col.key === "pending" && (
                        <IconAction title="Iniciar ambientação (você assume o aluno)" disabled={busyId === l.id} onClick={() => act(l, "start")}>
                          <Play size={16} />
                        </IconAction>
                      )}
                      {col.key !== "done" && (
                        <IconAction title="Concluir ambientação" disabled={busyId === l.id} onClick={() => act(l, "done")}>
                          <CheckCheck size={16} />
                        </IconAction>
                      )}
                      <IconAction title="Editar" disabled={busyId === l.id} onClick={(e) => setMenu({ anchor: e.currentTarget, lead: l })}>
                        <MoreVertical size={16} />
                      </IconAction>
                    </div>
                    {col.key !== "done" && <div className={classes.meta}>Checklist: {STEPS.filter((s) => l.checklist && l.checklist[s.key]).length}/{STEPS.length}</div>}
                    {l.unread > 0 && <Chip size="small" color="primary" label={`Aluno respondeu (${l.unread})`} style={{ alignSelf: "flex-start" }} />}
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
      <Menu anchorEl={menu && menu.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu && <MenuItem onClick={() => openTutor(menu.lead)}><ListItemIcon><UserCog size={17} /></ListItemIcon>Trocar o tutor</MenuItem>}
        {menu && COLUMNS.filter((c) => c.key !== menu.lead.onboardingStatus).map((c) => (
          <MenuItem key={c.key} onClick={() => { const l = menu.lead; setMenu(null); edit(l, { status: c.key }, `Aluno movido para ${c.title.toLowerCase()}.`); }}>
            <ListItemIcon>{c.key === "done" ? <MoveRight size={17} /> : <Undo2 size={17} />}</ListItemIcon>Mover para {c.title.toLowerCase()}
          </MenuItem>
        ))}
      </Menu>
      <Dialog open={checklistFor !== null} onClose={() => setChecklistFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Checklist da ambientação</DialogTitle>
        <DialogContent>
          {(() => {
            const lead = rows.find((r) => r.id === checklistFor);
            if (!lead) return null;
            return (
              <>
                <Typography variant="body2" color="textSecondary" gutterBottom>{lead.name}. Marque o que já foi feito; concluir a ambientação continua sendo decisão do tutor.</Typography>
                {STEPS.map((s) => (
                  <div key={s.key}>
                    <FormControlLabel control={<Checkbox color="primary" checked={!!(lead.checklist && lead.checklist[s.key])} onChange={(e) => toggleStep(lead, s.key, e.target.checked)} />} label={s.label} />
                  </div>
                ))}
              </>
            );
          })()}
        </DialogContent>
        <DialogActions><Button variant="outlined" color="secondary" onClick={() => setChecklistFor(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!welcomeFor} onClose={() => setWelcomeFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar boas-vindas</DialogTitle>
        <DialogContent>
          {welcomeFor && (
            <>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                {welcomeFor.blocked ? "O aluno já respondeu ou a conversa já está em andamento: escreva abaixo o que quiser enviar." : `Texto pronto para ${welcomeFor.lead.name}. Edite se quiser; ao enviar, a ambientação é iniciada e a conversa fica com você.`}
              </Typography>
              <TextField fullWidth multiline minRows={4} variant="outlined" value={welcomeFor.text} onChange={(e) => setWelcomeFor({ ...welcomeFor, text: e.target.value })} />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setWelcomeFor(null)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={sendWelcome} disabled={!welcomeFor || !welcomeFor.text.trim() || busyId === (welcomeFor && welcomeFor.lead.id)}>Enviar</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!tutorFor} onClose={() => setTutorFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Trocar o tutor</DialogTitle>
        <DialogContent>
          {tutorFor && (
            <>
              <Typography variant="body2" color="textSecondary" style={{ marginBottom: 8 }}>{tutorFor.lead.name}. A conversa de ambientação passa para o tutor escolhido e nada é enviado ao aluno.</Typography>
              <TextField select fullWidth variant="outlined" size="small" label="Tutor" value={tutorFor.pick} onChange={(e) => setTutorFor({ ...tutorFor, pick: e.target.value })}>
                <MenuItem value="auto">Escolher pelo rodízio da tutoria</MenuItem>
                <MenuItem value={0}>Sem tutor (volta para a fila)</MenuItem>
                {tutorFor.tutors.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}{t.outside ? " (de outro polo)" : ""}</MenuItem>)}
              </TextField>
              {tutorFor.tutors.length === 0 && <Typography variant="caption" color="textSecondary">Nenhum tutor está cadastrado em Polos e equipes. Cadastre tutores e vincule-os ao polo para escolher aqui.</Typography>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setTutorFor(null)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={saveTutor}>Salvar</Button>
        </DialogActions>
      </Dialog>
      <Typography variant="caption" color="textSecondary">O sistema avisa quando um aluno passa de 24 horas sem o primeiro contato do tutor.</Typography>
    </MainContainer>
  );
};

export default Onboarding;
