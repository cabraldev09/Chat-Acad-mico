import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem,
  Paper, TextField, Tooltip, Typography,
} from "@material-ui/core";
import { AlertTriangle, ClipboardCopy, FileText, GraduationCap, Search, Send, Trash2, Upload } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { copyText, errorText, hours, openPdf, useShared } from "../Analysis/shared";

// "Grades": the matrices of the courses. The commercial team finds a course, copies the summary or sends the PDF to
// the candidate in the conversation; the management publishes and updates the matrices.

const SendDialog = ({ grade, onClose }) => {
  const [tickets, setTickets] = useState(null);
  const [ticketId, setTicketId] = useState("");
  const [summary, setSummary] = useState(true);
  const [pdf, setPdf] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!grade) return;
    setTicketId("");
    setTickets(null);
    Promise.all(["open", "pending"].map((status) => api.get("/tickets", { params: { status, showAll: "false", groups: "exclude" } })))
      .then(([a, b]) => setTickets([...a.data.tickets, ...b.data.tickets]))
      .catch((e) => { toastError(e); setTickets([]); });
  }, [grade]);

  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/grades/${grade.id}/send`, { ticketId: Number(ticketId), summary, pdf });
      toast.success("Grade enviada na conversa.");
      onClose();
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  return (
    <Dialog open={!!grade} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Enviar na conversa</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>{grade && grade.courseName}</Typography>
        {tickets === null ? <CircularProgress size={22} /> : (
          <TextField select fullWidth size="small" variant="outlined" margin="dense" label="Conversa" value={ticketId} onChange={(e) => setTicketId(e.target.value)} InputLabelProps={{ shrink: true }}
            helperText={tickets.length ? "" : "Nenhuma conversa aberta. Abra a conversa do candidato primeiro."}>
            {tickets.map((t) => <MenuItem key={t.id} value={t.id}>{t.contact.name}</MenuItem>)}
          </TextField>
        )}
        <div style={{ display: "grid" }}>
          <FormControlLabel control={<Checkbox color="primary" checked={summary} onChange={(e) => setSummary(e.target.checked)} />} label="Mensagem com o resumo da grade" />
          <FormControlLabel control={<Checkbox color="primary" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />} label="PDF da matriz" />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="secondary">Cancelar</Button>
        <Button onClick={send} variant="contained" color="primary" disabled={busy || !ticketId || (!summary && !pdf)}>{busy ? <CircularProgress size={18} /> : "Enviar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const GradeCard = ({ g, manager, onSend, onDelete }) => {
  const c = useShared();
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/grades/${g.id}`);
      await copyText(data.whatsappSummary, "Resumo copiado. É só colar na conversa.");
    } catch (e) { toastError(e); }
    setBusy(false);
  };
  return (
    <Paper variant="outlined" className={c.card}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Typography style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, flex: 1 }}>{g.courseName}</Typography>
        {!g.complete && <Tooltip title="O PDF não trouxe todos os dados (curso, carga horária ou duração). Confira antes de enviar."><span><AlertTriangle size={17} color="#d97706" /></span></Tooltip>}
      </div>
      <div className={c.row}>
        {g.degree && <span className={c.chip}>{g.degree}</span>}
        {g.modality && <span className={c.chip}>{g.modality}</span>}
        {g.curriculumTerm && <span className={c.chip}>Matriz {g.curriculumTerm}</span>}
        {g.knowledgeArea && <span className={c.chip}>{g.knowledgeArea}</span>}
      </div>
      <div className={c.muted} style={{ display: "grid", gap: 2 }}>
        <span>Duração: {g.durationSemesters ? `${g.durationSemesters} semestres` : "—"} · Carga total: {hours(g.totalCourseHours)}</span>
        <span>Estágio: {g.totalInternshipHours ? hours(g.totalInternshipHours) : "sem estágio obrigatório"} · TCC: {g.hasTcc ? "sim" : "não"}</span>
      </div>
      <div className={c.row} style={{ marginTop: 4 }}>
        <Button size="small" variant="contained" color="primary" startIcon={<Send size={15} />} onClick={() => onSend(g)}>Enviar</Button>
        <Button size="small" variant="outlined" startIcon={<ClipboardCopy size={15} />} onClick={copy} disabled={busy}>Copiar resumo</Button>
        <Button size="small" variant="outlined" startIcon={<FileText size={15} />} onClick={() => openPdf(`/grades/${g.id}/file`)}>PDF</Button>
        <span style={{ flex: 1 }} />
        {manager && <IconButton size="small" aria-label="Excluir a grade" onClick={() => onDelete(g)}><Trash2 size={16} /></IconButton>}
      </div>
    </Paper>
  );
};

const Grades = () => {
  const c = useShared();
  const { user } = useContext(AuthContext);
  const manager = isManager(user);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [degree, setDegree] = useState("");
  const [area, setArea] = useState("");
  const [sendFor, setSendFor] = useState(null);
  const [delFor, setDelFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const timer = useRef(null);

  const load = useCallback(() => {
    api.get("/grades", { params: { search: search.trim() || undefined, degree: degree || undefined, area: area || undefined } })
      .then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setData({ grades: [], degrees: [], areas: [], modalities: [] }); });
  }, [search, degree, area]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); return () => clearTimeout(timer.current); }, [load]);

  const upload = async (files) => {
    const list = Array.from(files || []).filter((f) => /\.pdf$/i.test(f.name));
    if (!list.length) { toast.error("Escolha arquivos PDF."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      list.forEach((f) => form.append("files", f));
      form.append("mode", "upsert");
      const { data: r } = await api.post("/grades", form);
      toast.success(`${r.created} nova(s), ${r.updated} atualizada(s), ${r.unchanged} sem mudança${r.failed ? `, ${r.failed} com problema` : ""}.`);
      const problems = (r.results || []).filter((x) => !x.ok);
      if (problems.length) toast.warn(`${problems[0].name}: ${problems[0].message}`, { autoClose: 9000 });
      load();
    } catch (e) {
      const results = e.response && e.response.data && e.response.data.results;
      toast.error(results && results[0] ? `${results[0].name}: ${results[0].message}` : errorText(e));
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const importDefaults = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post("/grades/import-defaults", {});
      toast.success(`Grades padrão: ${r.created} nova(s), ${r.updated} atualizada(s), ${r.unchanged} sem mudança.`);
      load();
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  const remove = async () => {
    try { await api.delete(`/grades/${delFor.id}`); toast.success("Grade excluída."); setDelFor(null); load(); } catch (e) { toastError(e); }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Grades</Title>
        <MainHeaderButtonsWrapper>
          <TextField size="small" variant="outlined" placeholder="Buscar curso, área ou tipo" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          {manager && (
            <>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
              <Button variant="contained" color="primary" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />} disabled={busy} onClick={() => fileInput.current && fileInput.current.click()}>Enviar grades (PDF)</Button>
              <Button variant="outlined" disabled={busy} onClick={importDefaults}>Importar grades padrão</Button>
            </>
          )}
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={c.body}>
        <div className={c.row} style={{ marginBottom: 12 }}>
          <TextField select size="small" variant="outlined" label="Tipo" value={degree} onChange={(e) => setDegree(e.target.value)} style={{ minWidth: 170 }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Todos</MenuItem>
            {(data ? data.degrees : []).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <TextField select size="small" variant="outlined" label="Área" value={area} onChange={(e) => setArea(e.target.value)} style={{ minWidth: 200 }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Todas</MenuItem>
            {(data ? data.areas : []).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <span className={c.muted}>{data ? `${data.grades.length} grade(s)` : ""}</span>
        </div>
        {!data ? <CircularProgress size={26} /> : data.grades.length === 0 ? (
          <Paper variant="outlined" className={c.card} style={{ maxWidth: 560 }}>
            <div className={c.row}><GraduationCap size={22} /><Typography style={{ fontWeight: 700 }}>Nenhuma grade encontrada</Typography></div>
            <Typography variant="body2" color="textSecondary">{manager ? "Envie os PDFs das matrizes curriculares (vários de uma vez) ou use “Importar grades padrão”." : "Peça à coordenação para publicar as matrizes."}</Typography>
          </Paper>
        ) : (
          <div className={c.grid}>
            {data.grades.map((g) => <GradeCard key={g.id} g={g} manager={manager} onSend={setSendFor} onDelete={setDelFor} />)}
          </div>
        )}
      </div>
      <SendDialog grade={sendFor} onClose={() => setSendFor(null)} />
      <Dialog open={!!delFor} onClose={() => setDelFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Excluir a grade?</DialogTitle>
        <DialogContent><Typography variant="body2">“{delFor && delFor.courseName}” e o PDF dela saem do catálogo. Para trazer de volta é preciso enviar o PDF de novo.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDelFor(null)} variant="outlined" color="secondary">Cancelar</Button>
          <Button onClick={remove} variant="contained" color="primary">Excluir</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default Grades;
