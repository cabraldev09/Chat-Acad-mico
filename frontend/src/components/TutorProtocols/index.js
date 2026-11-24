import React, { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, makeStyles } from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { Check, ClipboardList, Plus } from "lucide-react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The protocols of the tutoring, on the tutor's side: simple. The tutor writes the number and the subject of the case opened in the
// institution's system, may tell the student in the conversation, and it stays in the student's history.
export const TUTORING = ["onboarding", "support"];

const useStyles = makeStyles((theme) => ({
  bar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 16px", borderBottom: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, fontSize: 13 },
  item: { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 260px", lineHeight: 1.4 },
  text: { minWidth: 0, overflowWrap: "anywhere" },
  muted: { color: theme.palette.text.secondary },
  btn: { textTransform: "none", borderRadius: 8, minHeight: 32, fontWeight: 600, whiteSpace: "nowrap", flex: "none" },
  fields: { display: "grid", gap: 12 },
}));

// pickStudent: a new protocol from the list of protocols (Meus alunos), for one of the tutor's students, with or without a conversation
export const ProtocolDialog = ({ open, onClose, ticketId, issue, onDone, pickStudent = false }) => {
  const [number, setNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const [students, setStudents] = useState(null);
  const [student, setStudent] = useState(null);
  useEffect(() => {
    if (!open) return;
    setNumber((issue && issue.protocolNumber) || "");
    setSubject((issue && issue.protocolName) || "");
    setTell(true);
    setStudent(null);
    if (pickStudent && students === null) {
      api.get("/tutoria/students").then(({ data }) => setStudents((data.students || []).filter((s) => s.leadId))).catch((e) => { setStudents([]); toastError(e); });
    }
  }, [open, issue, pickStudent, students]);
  // the student has no conversation with the tutoring yet: the protocol is registered, the notice waits for the student to write
  const noConversation = pickStudent && student && !student.ticketId;
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/tutoria/protocols", {
        ...(pickStudent ? { leadId: student && student.leadId } : { ticketId, issueId: issue ? issue.id : undefined }),
        protocolNumber: number, protocolName: subject, notifyStudent: tell && !noConversation
      });
      if (data.warning) toast.warn(data.warning);
      else toast.success(tell ? "Protocolo registrado e aluno avisado." : "Protocolo registrado no histórico do aluno.");
      onDone && onDone();
      onClose();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Registrar protocolo</DialogTitle>
      <DialogContent>
        {issue && issue.summary && <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.5, opacity: 0.8 }}>{issue.summary}</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {pickStudent && (
            <Autocomplete
              options={students || []}
              loading={students === null}
              loadingText="Carregando seus alunos..."
              noOptionsText="Nenhum aluno encontrado."
              value={student}
              onChange={(_e, v) => setStudent(v)}
              getOptionLabel={(o) => o.name || ""}
              getOptionSelected={(o, v) => o.leadId === v.leadId}
              renderOption={(o) => (<div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{o.name}</div><div style={{ fontSize: 12, opacity: 0.7 }}>{[o.course, o.polo].filter(Boolean).join(" · ")}</div></div>)}
              renderInput={(params) => <TextField {...params} autoFocus size="small" variant="outlined" label="Aluno" InputLabelProps={{ ...params.InputLabelProps, shrink: true }} placeholder="Busque pelo nome" />}
            />
          )}
          <TextField autoFocus={!pickStudent} size="small" variant="outlined" label="Número do protocolo" InputLabelProps={{ shrink: true }} value={number} onChange={(e) => setNumber(e.target.value)} inputProps={{ maxLength: 60 }} />
          <TextField size="small" variant="outlined" label="Assunto" InputLabelProps={{ shrink: true }} placeholder="Ex.: acesso ao AVA, nota da prova" value={subject} onChange={(e) => setSubject(e.target.value)} inputProps={{ maxLength: 160 }} />
          {noConversation
            ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>Este aluno ainda não conversou com a tutoria. O protocolo fica registrado no histórico dele; avise quando ele chamar.</p>
            : <FormControlLabel control={<Checkbox color="primary" checked={tell} onChange={(e) => setTell(e.target.checked)} />} label={pickStudent ? "Avisar o aluno pela conversa da tutoria" : "Avisar o aluno nesta conversa"} />}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disableElevation disabled={busy || !number.trim() || !subject.trim() || (pickStudent && !student)} onClick={save}>{busy ? "Registrando..." : "Registrar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export const ResolveDialog = ({ open, onClose, issue, onDone }) => {
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setTell(true); }, [open]);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/tutoria/protocols/${issue.id}/resolve`, { notifyStudent: tell });
      if (data.warning) toast.warn(data.warning);
      else toast.success(tell ? "Marcado como resolvido e aluno avisado." : "Marcado como resolvido.");
      onDone && onDone();
      onClose();
    } catch (err) { toastError(err); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Protocolo resolvido</DialogTitle>
      <DialogContent>
        <p style={{ margin: "0 0 8px", fontSize: 14 }}>{issue && issue.protocolNumber ? `Protocolo ${issue.protocolNumber}${issue.protocolName ? ` · ${issue.protocolName}` : ""}` : issue && issue.summary}</p>
        <FormControlLabel control={<Checkbox color="primary" checked={tell} onChange={(e) => setTell(e.target.checked)} />} label="Avisar o aluno nesta conversa" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disableElevation disabled={busy} onClick={save}>Marcar resolvido</Button>
      </DialogActions>
    </Dialog>
  );
};

// the strip of the conversation: what is waiting for a protocol and the protocols still open; "Registrar protocolo" always at hand
export const ProtocolBar = ({ ticket }) => {
  const c = useStyles();
  const tutoring = !!ticket && !!ticket.id && !ticket.isGroup && TUTORING.includes(String(ticket.segment || ""));
  const [items, setItems] = useState([]);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => {
    if (!tutoring) return;
    api.get(`/tickets/${ticket.id}/protocols`).then(({ data }) => setItems(data.items || [])).catch(() => setItems([]));
  }, [ticket && ticket.id, tutoring]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const open = (e) => { if (e.detail && Number(e.detail.ticketId) === Number(ticket && ticket.id)) setDialog({ kind: "new" }); };
    window.addEventListener("protocolOpen", open);
    return () => window.removeEventListener("protocolOpen", open);
  }, [ticket && ticket.id]);
  if (!tutoring) return null;
  const open = items.filter((i) => i.status !== "resolvida");
  return (
    <>
      {open.length > 0 && (
        <div className={c.bar} role="status">
          {open.slice(0, 2).map((i) => (
            <span key={i.id} className={c.item}>
              <ClipboardList size={16} style={{ flex: "none" }} />
              <span className={c.text}>
                {i.status === "aberta" ? <><b>Falta o protocolo:</b> <span className={c.muted}>{i.summary}</span></> : <><b>Protocolo {i.protocolNumber}</b> <span className={c.muted}>· {i.protocolName}</span></>}
              </span>
              {i.status === "aberta"
                ? <Button size="small" variant="outlined" className={c.btn} startIcon={<Plus size={14} />} onClick={() => setDialog({ kind: "register", issue: i })}>Registrar protocolo</Button>
                : <Button size="small" variant="outlined" className={c.btn} startIcon={<Check size={14} />} onClick={() => setDialog({ kind: "resolve", issue: i })}>Resolvido</Button>}
            </span>
          ))}
        </div>
      )}
      <ProtocolDialog open={!!dialog && dialog.kind !== "resolve"} onClose={() => setDialog(null)} ticketId={ticket.id} issue={dialog && dialog.kind === "register" ? dialog.issue : null} onDone={load} />
      <ResolveDialog open={!!dialog && dialog.kind === "resolve"} onClose={() => setDialog(null)} issue={dialog && dialog.issue} onDone={load} />
    </>
  );
};

export default ProtocolBar;
