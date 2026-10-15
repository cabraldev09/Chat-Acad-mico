import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Drawer, IconButton, Tabs, Tab, Button, TextField, MenuItem, Checkbox, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, makeStyles, CircularProgress,
} from "@material-ui/core";
import {
  X, MessageSquare, Phone, Mail, StickyNote, PhoneCall, MapPin, ArrowRight, ListTodo,
  Info, Trash2, Trophy, ThumbsDown, Check, FileText, FilePlus2, Download, Link2, CopyPlus, SendHorizonal, Send,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import EnrollDialog from "./EnrollDialog";
import IconAction from "../../components/IconAction";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import openSocket from "../../services/socket-io";
import { WhatsAppBrand } from "../../icons/brands";
import LeadFields from "./LeadFields";
import ProposalStudio from "./ProposalStudio";
import PaymentTab from "./PaymentTab";
import { ScoreRing, SourceIcon, ago, isOverdue, burst, initials } from "./shared";

const useStyles = makeStyles((theme) => ({
  paper: { width: 500, maxWidth: "100vw", display: "flex", flexDirection: "column", borderLeft: theme.border.divider, animation: "slide-in-left .0s" },
  // beside the conversation: it does not block the chat, so the consultant can copy from it and paste here
  paperSide: { width: "min(500px, 38vw)", minWidth: 380, top: 56, height: "calc(100% - 56px)", boxShadow: "-8px 0 24px -12px rgba(0,0,0,.25)" },
  head: { padding: theme.spacing(2.5, 2.5, 1.5), borderBottom: theme.border.divider },
  titleRow: { display: "flex", alignItems: "center", gap: theme.spacing(1.5) },
  avatar: { width: 44, height: 44, borderRadius: 12, background: "#0B4279", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, flex: "none" },
  name: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 },
  meta: { display: "flex", alignItems: "center", gap: 8, color: theme.palette.text.secondary, fontSize: 13, flexWrap: "wrap", marginTop: 2 },
  stepper: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: theme.spacing(1.75) },
  step: {
    border: theme.border.divider, borderRadius: 999, padding: "3px 11px", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
    background: "transparent", color: theme.palette.text.secondary, fontFamily: "inherit",
    transition: "all .2s var(--ease-out)", "&:hover": { borderColor: theme.palette.accent.main, color: theme.palette.text.primary },
  },
  stepDone: { background: theme.palette.action.selected, color: theme.palette.text.primary },
  stepNow: { background: "#0B4279", color: "#fff", borderColor: "#0B4279", boxShadow: "0 4px 12px -4px rgba(11,66,121,.6)" },
  actions: { display: "flex", gap: 8, marginTop: theme.spacing(1.75), flexWrap: "wrap" },
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: theme.spacing(2, 2.5, 3), ...theme.scrollbarStyles },
  footer: { borderTop: theme.border.divider, padding: theme.spacing(1.5, 2.5), display: "flex", justifyContent: "flex-end", gap: 8 },
  tl: { position: "relative", marginTop: theme.spacing(2) },
  tlItem: { display: "flex", gap: 12, paddingBottom: theme.spacing(2), position: "relative", animation: "page-in .3s var(--ease-out) both",
    "&:not(:last-child)::before": { content: '""', position: "absolute", left: 13, top: 28, bottom: 0, width: 1, background: theme.palette.divider } },
  tlIcon: { width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: theme.palette.action.selected, flex: "none", color: theme.palette.text.secondary },
  tlBody: { fontSize: 14, lineHeight: 1.45, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  tlMeta: { fontSize: 12, color: theme.palette.text.secondary },
  tab: { padding: "4px 6px", fontSize: 13, minWidth: 0 },
  tabCount: { marginLeft: 5, fontSize: 11, fontWeight: 600, padding: "0 6px", borderRadius: 999, background: theme.palette.action.selected },
  taskRow: { display: "flex", alignItems: "center", gap: 4, padding: theme.spacing(0.5, 0), borderBottom: theme.border.divider },
}));

const TYPE_ICON = {
  note: StickyNote, call: PhoneCall, whatsapp: WhatsAppBrand, email: Mail, visit: MapPin,
  stage: ArrowRight, task: ListTodo, system: Info,
};
const TYPE_LABEL = { note: "Nota", call: "Ligação", whatsapp: "WhatsApp", email: "E-mail", visit: "Visita" };
const TASK_LABEL = { ligar: "Ligar", whatsapp: "Enviar WhatsApp", email: "Enviar e-mail", visita: "Visita", proposta: "Enviar proposta", documentos: "Cobrar documentos", outro: "Outro" };

export const LostDialog = ({ open, reasons = [], onClose, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setReason(""); setNote(""); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Por que o lead foi perdido?</DialogTitle>
      <DialogContent>
        <TextField select fullWidth variant="outlined" margin="dense" label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((r) => (<MenuItem key={r} value={r}>{r}</MenuItem>))}
        </TextField>
        <TextField fullWidth multiline rows={3} variant="outlined" margin="dense" label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disabled={!reason} onClick={() => onConfirm(reason, note)}>Marcar como perdido</Button>
      </DialogActions>
    </Dialog>
  );
};

const LeadDrawer = ({ leadId, onClose, ctx, onChanged, initialTab, side = false }) => {
  const classes = useStyles();
  const history = useHistory();
  const { options, courses, stages, users, tags } = ctx;
  const [lead, setLead] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState(0);
  const [acts, setActs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [note, setNote] = useState({ type: "note", body: "" });
  const [task, setTask] = useState({ title: "", type: "ligar", dueAt: "" });
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [studio, setStudio] = useState(null); // { id } | {}
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const [l, a, t, pr] = await Promise.all([
        api.get(`/leads/${leadId}`), api.get(`/leads/${leadId}/activities`), api.get(`/leads/${leadId}/tasks`),
        api.get("/proposals", { params: { leadId } }),
      ]);
      setProposals(pr.data);
      setLead(l.data);
      setDraft((prev) => (prev && prev.id === l.data.id && prev.__dirty ? prev : { ...l.data, tagIds: l.data.tags.map((x) => x.id) }));
      setActs(a.data);
      setTasks(t.data);
    } catch (err) {
      toastError(err);
    }
  }, [leadId]);

  useEffect(() => { setLead(null); setDraft(null); setTab(initialTab || 0); load(); }, [leadId, load, initialTab]);

  useEffect(() => {
    if (!leadId) return undefined;
    const socket = openSocket();
    socket.on("lead", (d) => { if (d.lead && d.lead.id === leadId) load(); });
    return () => socket.disconnect();
  }, [leadId, load]);

  const changed = () => { load(); onChanged && onChanged(); };

  const save = async () => {
    setSaving(true);
    try {
      const { __dirty, ...d } = draft;
      await api.put(`/leads/${lead.id}`, {
        name: d.name, phone: d.phone, email: d.email, city: d.city, state: d.state, courseId: d.courseId,
        entryTerm: d.entryTerm, educationLevel: d.educationLevel, cpf: d.cpf || null, admissionType: d.admissionType,
        entrySemester: d.entrySemester || 1, extraSemesters: d.extraSemesters || 0, decisionTimeline: d.decisionTimeline, motivation: d.motivation,
        enemScore: d.admissionType === "ENEM" ? d.enemScore : null, source: d.source, notes: d.notes, ownerId: d.ownerId, tagIds: d.tagIds,
      });
      toast.success("Lead atualizado");
      setDraft(null);
      changed();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const move = async (stage, e, extra = {}) => {
    // confirming an enrollment hands the student to the tutor: dedicated dialog
    if (stage.type === "won" && !extra.skipEnroll) { setEnrollOpen(true); return; }
    try {
      await api.put(`/leads/${lead.id}/stage`, { stageId: stage.id, ...extra });
      if (stage.type === "won" && e) burst(e.clientX, e.clientY);
      toast.success(`Movido para “${stage.name}”`);
      changed();
    } catch (err) {
      toastError(err);
    }
  };

  const openChat = async () => {
    try {
      const { data } = await api.post(`/leads/${lead.id}/open-ticket`, {});
      history.push(`/tickets/${data.ticketId}`);
    } catch (err) {
      toastError(err);
    }
  };

  const addNote = async () => {
    if (!note.body.trim()) return;
    try {
      await api.post(`/leads/${lead.id}/activities`, note);
      setNote({ type: note.type, body: "" });
      changed();
    } catch (err) { toastError(err); }
  };

  const addTask = async () => {
    if (!task.title.trim() || !task.dueAt) return toast.error("Informe a tarefa e a data");
    try {
      await api.post(`/leads/${lead.id}/tasks`, { ...task, dueAt: new Date(task.dueAt).toISOString() });
      setTask({ title: "", type: task.type, dueAt: "" });
      changed();
    } catch (err) { toastError(err); }
  };

  const openStages = stages.filter((s) => s.type === "open");
  const won = stages.find((s) => s.type === "won");
  const lost = stages.find((s) => s.type === "lost");
  const currentIdx = lead ? openStages.findIndex((s) => s.id === lead.stageId) : -1;

  return (
    <Drawer anchor="right" variant={side ? "persistent" : "temporary"} open={!!leadId} onClose={onClose} classes={{ paper: side ? `${classes.paper} ${classes.paperSide}` : classes.paper }}>
      {!lead || !draft ? (
        <div style={{ margin: "auto" }}><CircularProgress /></div>
      ) : (
        <>
          <EnrollDialog open={enrollOpen} lead={lead} onClose={() => setEnrollOpen(false)} onDone={() => { changed(); }} />
          <LostDialog open={lostOpen} reasons={options.lostReasons} onClose={() => setLostOpen(false)}
            onConfirm={(reason, n) => { setLostOpen(false); move(lost, null, { lostReason: reason, lostNote: n }); }} />
          <div className={classes.head}>
            <div className={classes.titleRow}>
              <div className={classes.avatar}>{initials(lead.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={classes.name}>{lead.name}</div>
                <div className={classes.meta}>
                  <SourceIcon source={lead.source} /> {lead.source}
                  {lead.affiliate && <span style={{ color: "#0b4279", fontWeight: 600 }}>· indicado por {lead.affiliate.name}</span>}
                  {lead.course && <span>· {lead.course.name}</span>}
                  {lead.payments && lead.payments.length > 0 && <span style={{ color: "#15803d", fontWeight: 600 }}>· taxa de matrícula paga</span>}
                  <span>· criado {ago(lead.createdAt)}</span>
                </div>
              </div>
              <ScoreRing value={lead.score} size={38} />
              <IconButton size="small" onClick={onClose} aria-label="Fechar"><X /></IconButton>
            </div>

            <div className={classes.stepper}>
              {lead.stage.type === "open" ? openStages.map((s, i) => (
                <button type="button" key={s.id} onClick={() => move(s)}
                  className={`${classes.step} ${i < currentIdx ? classes.stepDone : ""} ${i === currentIdx ? classes.stepNow : ""}`}>
                  {s.name}
                </button>
              )) : (
                <button type="button" className={classes.step} style={{ background: lead.stage.color, color: "#fff", borderColor: lead.stage.color }}
                  onClick={() => move(openStages[0])} title="Reabrir lead">
                  {lead.stage.name}{lead.lostReason ? ` · ${lead.lostReason}` : ""} (reabrir)
                </button>
              )}
            </div>

            <div className={classes.actions}>
              <Button size="small" variant="contained" color="primary" startIcon={<MessageSquare size={16} />} onClick={openChat}>Abrir conversa</Button>
              {lead.phone && <Button size="small" variant="outlined" startIcon={<Phone size={16} />} href={`tel:+${lead.phone}`}>Ligar</Button>}
              {lead.email && <Button size="small" variant="outlined" startIcon={<Mail size={16} />} href={`mailto:${lead.email}`}>E-mail</Button>}
              <Button size="small" variant="contained" color="primary" startIcon={<FilePlus2 size={16} />} onClick={() => setStudio({})}>Gerar proposta</Button>
              {lead.stage.type === "open" && (
                <>
                  <Button size="small" variant="outlined" startIcon={<Trophy size={16} />} onClick={(e) => won && move(won, e)} style={{ color: "#16a34a", borderColor: "rgba(22,163,74,.5)" }}>Matriculado</Button>
                  <Button size="small" variant="outlined" startIcon={<ThumbsDown size={16} />} onClick={() => setLostOpen(true)} style={{ color: "#dc2626", borderColor: "rgba(220,38,38,.4)" }}>Perdido</Button>
                </>
              )}
            </div>
          </div>

          <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="fullWidth" style={{ margin: "12px 20px 0" }}>
            <Tab className={classes.tab} label="Resumo" />
            <Tab className={classes.tab} label={<span>Atividade{acts.length ? <b className={classes.tabCount}>{acts.length}</b> : null}</span>} />
            <Tab className={classes.tab} label={<span>Tarefas{tasks.filter((t) => !t.doneAt).length ? <b className={classes.tabCount}>{tasks.filter((t) => !t.doneAt).length}</b> : null}</span>} />
            <Tab className={classes.tab} label={<span>Propostas{proposals.length ? <b className={classes.tabCount}>{proposals.length}</b> : null}</span>} />
            <Tab className={classes.tab} label="Matrícula" />
          </Tabs>

          <div className={classes.body}>
            {tab === 0 && (
              <LeadFields lead={draft} options={options} courses={courses} users={users} tags={tags}
                onChange={(d) => setDraft({ ...d, __dirty: true })} />
            )}

            {tab === 1 && (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <TextField select size="small" variant="outlined" value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value })} style={{ minWidth: 130 }}>
                      {Object.entries(TYPE_LABEL).map(([k, v]) => (<MenuItem key={k} value={k}>{v}</MenuItem>))}
                    </TextField>
                    <Button variant="contained" color="primary" size="small" onClick={addNote} disabled={!note.body.trim()}>Registrar</Button>
                  </div>
                  <TextField multiline rows={2} variant="outlined" fullWidth placeholder="O que aconteceu? Combinados, objeções, próximos passos…" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
                </div>
                <div className={classes.tl}>
                  {acts.map((a) => {
                    const Icon = TYPE_ICON[a.type] || Info;
                    return (
                      <div key={a.id} className={classes.tlItem}>
                        <span className={classes.tlIcon}><Icon size={14} /></span>
                        <div style={{ minWidth: 0 }}>
                          <div className={classes.tlBody}>{a.body}</div>
                          <div className={classes.tlMeta}>{a.user ? `${a.user.name} · ` : ""}{ago(a.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 2 && (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  <TextField size="small" variant="outlined" fullWidth label="Nova tarefa" placeholder="Ex.: Ligar para confirmar visita" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <TextField select size="small" variant="outlined" value={task.type} onChange={(e) => setTask({ ...task, type: e.target.value })} style={{ minWidth: 170 }}>
                      {Object.entries(TASK_LABEL).map(([k, v]) => (<MenuItem key={k} value={k}>{v}</MenuItem>))}
                    </TextField>
                    <TextField size="small" variant="outlined" type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} InputLabelProps={{ shrink: true }} style={{ flex: 1 }} />
                    <Button variant="contained" color="primary" size="small" onClick={addTask}>Agendar</Button>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  {tasks.length === 0 && <Typography color="textSecondary" variant="body2">Nenhuma tarefa. Agende o próximo contato para não esfriar o lead.</Typography>}
                  {tasks.map((t) => (
                    <div key={t.id} className={classes.taskRow}>
                      <Checkbox size="small" color="primary" checked={!!t.doneAt} onChange={async () => { await api.post(`/leads/${lead.id}/tasks/${t.id}/toggle`); changed(); }} />
                      <div style={{ flex: 1, minWidth: 0, opacity: t.doneAt ? 0.55 : 1 }}>
                        <div style={{ fontSize: 14, textDecoration: t.doneAt ? "line-through" : "none" }}>{t.title}</div>
                        <div className={classes.tlMeta} style={{ color: !t.doneAt && isOverdue(t.dueAt) ? "#dc2626" : undefined }}>
                          {TASK_LABEL[t.type]} · {format(parseISO(t.dueAt), "dd/MM HH:mm")}{t.user ? ` · ${t.user.name}` : ""}
                        </div>
                      </div>
                      <IconButton size="small" onClick={async () => { await api.delete(`/leads/${lead.id}/tasks/${t.id}`); changed(); }}><Trash2 size={16} /></IconButton>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === 4 && <PaymentTab lead={lead} acts={acts} onChanged={changed} onEditSummary={() => setTab(0)} />}

            {tab === 3 && (
              <>
                <Button variant="contained" color="primary" size="small" startIcon={<FilePlus2 size={16} />} onClick={() => setStudio({})}>Nova proposta</Button>
                <div style={{ marginTop: 14 }}>
                  {proposals.length === 0 && <Typography color="textSecondary" variant="body2">Nenhuma proposta ainda. Escolha o curso, ajuste a bolsa e envie o PDF ao candidato pela própria conversa.</Typography>}
                  {proposals.map((pr) => (
                    <div key={pr.id} className={classes.taskRow} style={{ alignItems: "flex-start", padding: "10px 0" }}>
                      <FileText size={18} style={{ marginTop: 3, opacity: 0.7 }} />
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>#{pr.id} · {pr.courseName}</div>
                        <div className={classes.tlMeta}>
                          1ª mensalidade {Number(pr.firstMonthly).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · bolsa {Number(pr.bolsaPct).toFixed(2).replace(".", ",")}%
                        </div>
                        <div className={classes.tlMeta}>
                          {pr.status === "draft" ? "Rascunho" : `Enviada ${ago(pr.sentAt)}${pr.viewedAt ? ` · visualizada ${ago(pr.viewedAt)}` : " · ainda não visualizada"}`}
                          {pr.author ? ` · ${pr.author.name}` : ""}
                          {pr.affiliate ? ` · indicado pelo afiliado ${pr.affiliate.name}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 190 }}>
                        <IconAction title={pr.status === "draft" ? "Editar proposta" : "Ver proposta"} onClick={() => setStudio({ id: pr.id })}><FileText size={16} /></IconAction>
                        <IconAction title="Copiar mensagem do WhatsApp" onClick={async () => {
                          try {
                            const { data } = await api.get(`/proposals/${pr.id}`);
                            await navigator.clipboard.writeText((data.messages || []).map((m) => m.text).join("\n\n"));
                            toast.success("Mensagem copiada. Cole na conversa do WhatsApp.");
                          } catch (e) { toastError(e); }
                        }}><MessageSquare size={16} /></IconAction>
                        {lead.affiliate && pr.status !== "draft" && (
                          <IconAction title={`Enviar ao afiliado ${lead.affiliate.name} para encaminhar`} onClick={async () => {
                            try { await api.post(`/affiliates/${lead.affiliate.id}/send-proposal`, { proposalId: pr.id }); toast.success("Proposta enviada ao afiliado."); } catch (e) { toastError(e); }
                          }}><Send size={16} /></IconAction>
                        )}
                        <IconAction title="Baixar PDF" onClick={async () => {
                          try { const r = await api.get(`/proposals/${pr.id}/pdf`, { responseType: "blob" }); const u = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = u; a.download = `Proposta - ${lead.name}.pdf`; a.click(); URL.revokeObjectURL(u); } catch (e) { toastError(e); }
                        }}><Download size={16} /></IconAction>
                        {pr.status !== "draft" && <IconAction title="Copiar link da proposta" onClick={async () => { await navigator.clipboard.writeText(pr.link); toast.success("Link copiado."); }}><Link2 size={16} /></IconAction>}
                        <IconAction title={pr.status === "draft" ? "Enviar ao candidato" : "Reenviar ao candidato"} onClick={async () => {
                          try { await api.post(`/proposals/${pr.id}/send`, {}); toast.success("Proposta enviada ao candidato."); changed(); } catch (e) { toastError(e); }
                        }}><SendHorizonal size={16} /></IconAction>
                        <IconAction title="Duplicar como novo rascunho" onClick={async () => { try { const { data } = await api.post(`/proposals/${pr.id}/duplicate`); changed(); setStudio({ id: data.id }); } catch (e) { toastError(e); } }}><CopyPlus size={16} /></IconAction>
                        {pr.status === "draft" && <IconAction title="Excluir rascunho" onClick={async () => { try { await api.delete(`/proposals/${pr.id}`); toast.success("Rascunho excluído."); changed(); } catch (e) { toastError(e); } }}><Trash2 size={16} /></IconAction>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {studio && (
            <ProposalStudio lead={lead} proposalId={studio.id} ctx={ctx}
              onSaved={changed} onClose={(sent) => { setStudio(null); if (sent) setTab(3); changed(); }} />
          )}

          {tab === 0 && draft.__dirty && (
            <div className={classes.footer} style={{ animation: "page-in .25s var(--ease-out)" }}>
              <Button variant="outlined" color="secondary" onClick={() => { setDraft(null); load(); }}>Descartar</Button>
              <Button variant="contained" color="primary" startIcon={saving ? <CircularProgress size={14} /> : <Check size={16} />} onClick={save} disabled={saving}>Salvar alterações</Button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
};

export default LeadDrawer;
