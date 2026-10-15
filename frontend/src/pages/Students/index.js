import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Paper, TextField, Typography,
} from "@material-ui/core";
import { Ban, Copy, FilePlus2, KeyRound, LineChart, Search, ShieldCheck, UserPlus } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { copyText, errorText, useShared } from "../Analysis/shared";
import { DOC_LABEL, RESULT_LABEL } from "../AcademicAnalysis";

// "Alunos": who has access to the Portal do Aluno. The tutor registers the student (by RGM), sends the invitation (the
// link goes by e-mail when the account is set up, and can always be copied to send by WhatsApp), and follows the versions.

const StudentDialog = ({ open, onClose, onSaved, users, manager }) => {
  const [f, setF] = useState({ rgm: "", name: "", email: "", phone: "", courseName: "", responsibleUserId: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ rgm: "", name: "", email: "", phone: "", courseName: "", responsibleUserId: "" }); setBusy(false); } }, [open]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.post("/students", { ...f, responsibleUserId: f.responsibleUserId || undefined }); toast.success("Aluno cadastrado."); onSaved(data); } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Novo aluno</DialogTitle>
      <DialogContent>
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="RGM" value={f.rgm} onChange={set("rgm")} autoFocus InputLabelProps={{ shrink: true }} />
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="Nome completo" value={f.name} onChange={set("name")} InputLabelProps={{ shrink: true }} />
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="E-mail (para o convite)" value={f.email} onChange={set("email")} InputLabelProps={{ shrink: true }} />
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="WhatsApp (opcional)" value={f.phone} onChange={set("phone")} InputLabelProps={{ shrink: true }} />
        <TextField fullWidth size="small" variant="outlined" margin="dense" label="Curso (opcional)" value={f.courseName} onChange={set("courseName")} InputLabelProps={{ shrink: true }} helperText="O documento enviado tem de ser deste curso. Em branco, vale o do primeiro documento." />
        {manager && (
          <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Tutor responsável" value={f.responsibleUserId} onChange={set("responsibleUserId")} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Eu mesmo</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="secondary" disabled={busy}>Cancelar</Button>
        <Button onClick={save} variant="contained" color="primary" disabled={busy || !f.rgm.trim() || !f.name.trim()}>{busy ? <CircularProgress size={18} /> : "Cadastrar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const Students = () => {
  const c = useShared();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [portal, setPortal] = useState("");
  const [invite, setInvite] = useState(null);
  const [uploadFor, setUploadFor] = useState(null);
  const timer = useRef(null);
  const fileInput = useRef(null);

  const load = useCallback(() => {
    api.get("/students", { params: { search: search.trim() || undefined } }).then(({ data }) => setRows(data)).catch((e) => { toastError(e); setRows([]); });
  }, [search]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); return () => clearTimeout(timer.current); }, [load]);
  useEffect(() => {
    api.get("/students/portal-url").then(({ data }) => setPortal(data.url)).catch(() => undefined);
    if (manager) api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers((data.users || []).filter((u) => u.role === "tutor" || u.role === "coordenacao"))).catch(() => undefined);
  }, [manager]);

  const sendInvite = async (s) => {
    try { const { data } = await api.post(`/students/${s.id}/invite`, {}); setInvite({ student: s, ...data }); load(); } catch (e) { toast.error(errorText(e)); }
  };
  const block = async (s) => {
    try { await api.put(`/students/${s.id}`, { blocked: !s.blocked }); toast.success(s.blocked ? "Acesso liberado. Envie um novo convite." : "Acesso bloqueado."); load(); } catch (e) { toast.error(errorText(e)); }
  };
  const upload = async (file) => {
    const s = uploadFor;
    setUploadFor(null);
    if (!file || !s) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/students/${s.id}/upload`, form);
      toast.success(data.reused ? "Este documento não mudou nada na análise." : "Análise atualizada.");
      load();
    } catch (e) { toast.error(errorText(e), { autoClose: 9000 }); }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Alunos do portal</Title>
        <MainHeaderButtonsWrapper>
          <TextField size="small" variant="outlined" placeholder="Buscar nome, RGM ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 230 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          <Button variant="contained" color="primary" startIcon={<UserPlus size={16} />} onClick={() => setOpen(true)}>Novo aluno</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => upload(e.target.files[0])} />
      <div className={c.body}>
        {portal && <Typography variant="body2" color="textSecondary" style={{ marginBottom: 12 }}>Endereço do portal para os alunos: <b>{portal}</b> <Button size="small" startIcon={<Copy size={14} />} onClick={() => copyText(portal, "Endereço copiado.")}>Copiar</Button></Typography>}
        {rows === null ? <CircularProgress size={26} /> : rows.length === 0 ? (
          <Paper variant="outlined" className={c.card} style={{ maxWidth: 640 }}>
            <Typography style={{ fontWeight: 700 }}>Nenhum aluno cadastrado</Typography>
            <Typography variant="body2" color="textSecondary">Cadastre o aluno pelo RGM e envie o convite. Ele escolhe a própria senha, vê a situação acadêmica e a previsão de formatura e pode enviar um extrato novo quando quiser.</Typography>
          </Paper>
        ) : (
          <div className={c.grid}>
            {rows.map((s) => {
              const res = s.current && RESULT_LABEL[s.current.status];
              return (
                <Paper key={s.id} variant="outlined" className={c.card}>
                  <Typography style={{ fontWeight: 700 }}>{s.name}</Typography>
                  <Typography variant="body2" color="textSecondary">RGM {s.rgm}{s.courseName ? ` · ${s.courseName}` : ""}</Typography>
                  <div className={c.row}>
                    <span className={c.chip}>{s.blocked ? "Bloqueado" : s.activated ? "Acesso ativo" : "Convite pendente"}</span>
                    {s.current && <span className={c.chip}>{DOC_LABEL[s.current.documentType] || "Documento"} · v{s.current.version}</span>}
                    {s.current && s.current.currentPeriod && <span className={c.chip}>{s.current.currentPeriod}º período</span>}
                    {res && <span className={c.chip}>{res[0]}</span>}
                  </div>
                  <span className={c.muted}>{s.responsibleName ? `Tutor: ${s.responsibleName} · ` : ""}{s.email || "sem e-mail"}{s.lastLoginAt ? ` · último acesso ${new Date(s.lastLoginAt).toLocaleDateString("pt-BR")}` : ""}</span>
                  <div className={c.row} style={{ marginTop: 4 }}>
                    <Button size="small" variant="contained" color="primary" startIcon={<KeyRound size={15} />} onClick={() => sendInvite(s)} disabled={s.blocked}>{s.activated ? "Nova senha" : "Convite"}</Button>
                    <Button size="small" variant="outlined" startIcon={<FilePlus2 size={15} />} onClick={() => { setUploadFor(s); setTimeout(() => fileInput.current && fileInput.current.click(), 0); }}>Enviar PDF</Button>
                    {s.current && <Button size="small" variant="outlined" startIcon={<LineChart size={15} />} onClick={() => history.push(`/analise-academica/${s.current.id}`)}>Análise</Button>}
                    <Button size="small" variant="outlined" startIcon={s.blocked ? <ShieldCheck size={15} /> : <Ban size={15} />} onClick={() => block(s)}>{s.blocked ? "Liberar" : "Bloquear"}</Button>
                  </div>
                </Paper>
              );
            })}
          </div>
        )}
      </div>
      <StudentDialog open={open} onClose={() => setOpen(false)} users={users} manager={manager} onSaved={(s) => { setOpen(false); load(); sendInvite(s); }} />
      <Dialog open={!!invite} onClose={() => setInvite(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{invite && invite.student.activated ? "Link para criar uma nova senha" : "Convite para o portal"}</DialogTitle>
        <DialogContent>
          {invite && (
            <>
              <Typography variant="body2" gutterBottom>{invite.emailed ? `Enviamos o link por e-mail para ${invite.student.email}.` : invite.student.email ? "O e-mail do sistema ainda não está configurado (Configurações → E-mail): copie o link e mande pelo WhatsApp." : "O aluno não tem e-mail cadastrado: copie o link e mande pelo WhatsApp."}</Typography>
              <TextField fullWidth multiline size="small" variant="outlined" value={invite.link} InputProps={{ readOnly: true }} />
              <Typography variant="caption" color="textSecondary">O link vale por {invite.expires} e só pode ser usado uma vez.</Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvite(null)} variant="outlined" color="secondary">Fechar</Button>
          <Button onClick={() => copyText(invite.link, "Link copiado.")} variant="contained" color="primary" startIcon={<Copy size={15} />}>Copiar o link</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default Students;
