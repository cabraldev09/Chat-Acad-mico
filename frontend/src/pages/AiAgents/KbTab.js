import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, TextField, Typography, Chip, Tabs, Tab, FormControlLabel, Switch, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, MenuItem, makeStyles } from "@material-ui/core";
import { Trash2, FileText, HelpCircle, Link2, Upload, Pencil, Search, Sparkles } from "lucide-react";

import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  intro: { fontSize: 13.5, color: theme.palette.text.secondary, marginBottom: theme.spacing(1.5) },
  add: { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5), marginBottom: theme.spacing(2) },
  list: { display: "flex", flexDirection: "column", gap: theme.spacing(0.75) },
  doc: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(0.75, 1.25), borderRadius: 12, border: `1px solid ${theme.palette.divider}` },
  docIcon: { flex: "none", color: theme.palette.text.secondary, display: "flex" },
  docTitle: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 500 },
  probe: { borderRadius: 14, border: `1px dashed ${theme.palette.divider}`, padding: theme.spacing(1.5), marginBottom: theme.spacing(2) },
  hit: { borderLeft: `3px solid ${theme.palette.primary.main}`, background: theme.palette.action.hover, borderRadius: 8, padding: theme.spacing(0.75, 1.25), marginTop: theme.spacing(0.75), fontSize: 13, whiteSpace: "pre-wrap" },
  hitTitle: { fontSize: 12, fontWeight: 700, color: theme.palette.text.secondary, marginBottom: 2 },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(3, 1), fontSize: 14 },
}));

const SOURCE = { texto: "Texto", arquivo: "Arquivo", url: "Página da web", aprendido: "Aprendido" };

// The subject of a document: the commercial agent reads a passage only when the question is about its subject, which keeps the prompt short.
const TOPICS = [
  ["institutional/platform", "Plataforma de estudo"], ["institutional/tutoring", "Tutoria"], ["institutional/faculty", "Corpo docente"], ["institutional/enrollment", "Matrícula e documentos"],
  ["institutional/mec", "Mudanças do MEC"], ["institutional/internship", "Estágio remunerado"], ["institutional/recognition", "Reconhecimento do curso"], ["institutional/analysis", "Análise curricular"],
];
const COURSE_TOPICS = [["overview", "Visão geral"], ["modality", "Modalidade"], ["curriculum", "Grade"], ["internship", "Estágio"], ["tcc", "TCC"], ["regulation", "Regras e MEC"]];
export const topicLabel = (t, courses) => {
  if (!t) return "";
  const known = TOPICS.find(([k]) => k === t);
  if (known) return known[1];
  const m = String(t).match(/^courses\/(\d+)\/(\w+)$/);
  if (m) return `${(courses.find((c) => c.id === Number(m[1])) || {}).name || `Curso ${m[1]}`} · ${(COURSE_TOPICS.find(([k]) => k === m[2]) || [])[1] || m[2]}`;
  return t;
};

const TopicPicker = ({ topic, courses, onChange }) => {
  const m = String(topic || "").match(/^courses\/(\d+)\/(\w+)$/);
  const kind = !topic ? "" : m ? "course" : topic;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <TextField select size="small" variant="outlined" margin="dense" label="Assunto (opcional)" style={{ flex: "1 1 220px" }} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} value={kind}
        onChange={(e) => onChange(e.target.value === "course" ? `courses/${(courses[0] || {}).id || 0}/overview` : e.target.value)}
        helperText="Com assunto, o agente só lê este texto quando a conversa for sobre ele.">
        <MenuItem value="">Geral (lido por palavras)</MenuItem>
        {TOPICS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
        <MenuItem value="course">Sobre um curso</MenuItem>
      </TextField>
      {m && (
        <>
          <TextField select size="small" variant="outlined" margin="dense" label="Curso" style={{ flex: "1 1 200px" }} InputLabelProps={{ shrink: true }} value={Number(m[1])} onChange={(e) => onChange(`courses/${e.target.value}/${m[2]}`)}>
            {courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" variant="outlined" margin="dense" label="Parte" style={{ flex: "1 1 140px" }} InputLabelProps={{ shrink: true }} value={m[2]} onChange={(e) => onChange(`courses/${m[1]}/${e.target.value}`)}>
            {COURSE_TOPICS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </TextField>
        </>
      )}
    </div>
  );
};
const courseOfTopic = (t) => { const m = String(t || "").match(/^courses\/(\d+)\//); return m ? Number(m[1]) : null; };

// Documents the agent can quote. Only the few passages that match each question are sent to the model.
const KbTab = ({ agentId, initialMode = 0, initialTopic = "" }) => {
  const classes = useStyles();
  const [docs, setDocs] = useState([]);
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ title: "", content: "", keywords: "", url: "", shared: false, topic: initialTopic });
  const [courses, setCourses] = useState([]);
  useEffect(() => { api.get("/courses").then(({ data }) => setCourses(Array.isArray(data) ? data : data.courses || [])).catch(() => undefined); }, []);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [q, setQ] = useState("");
  const [probe, setProbe] = useState({ question: "", hits: null });
  const [editing, setEditing] = useState(null);

  const runProbe = async () => {
    try {
      const { data } = await api.post(`/ai-agents/${agentId}/kb-search`, { question: probe.question });
      setProbe({ ...probe, hits: data });
    } catch (err) { toastError(err); }
  };
  const openEdit = async (d) => {
    try { const { data } = await api.get(`/ai-agents/${agentId}/kb/${d.id}`); setEditing(data); } catch (err) { toastError(err); }
  };
  const saveEdit = async () => {
    try {
      await api.put(`/ai-agents/${agentId}/kb/${editing.id}`, { title: editing.title, content: editing.content, keywords: editing.keywords, topic: editing.topic || "", courseId: courseOfTopic(editing.topic) || "" });
      toast.success("Documento atualizado.");
      setEditing(null);
      load();
    } catch (err) { toastError(err); }
  };

  const load = useCallback(() => api.get(`/ai-agents/${agentId}/kb`).then(({ data }) => setDocs(data)).catch(toastError), [agentId]);
  useEffect(() => { load(); }, [load]);

  const reset = () => setForm({ title: "", content: "", keywords: "", url: "", shared: false, topic: "" });
  const subject = () => ({ topic: form.topic || "", courseId: courseOfTopic(form.topic) || "" });
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reset(); load(); } catch (err) { toastError(err); }
    setBusy(false);
  };

  const addText = () => run(() => api.post(`/ai-agents/${agentId}/kb`, { title: form.title, content: form.content, shared: form.shared, ...subject() }), "Documento adicionado.");
  const addFaq = () => run(() => api.post(`/ai-agents/${agentId}/kb`, { kind: "faq", title: form.title, content: form.content, keywords: form.keywords, shared: form.shared }), "Pergunta frequente adicionada.");
  const addUrl = () => run(() => api.post(`/ai-agents/${agentId}/kb/url`, { url: form.url, title: form.title, shared: form.shared, ...subject() }), "Página lida e adicionada.");
  const addFile = (file) => run(() => {
    const data = new FormData();
    data.append("file", file);
    if (form.title) data.append("title", form.title);
    data.append("shared", String(form.shared));
    if (form.topic) { data.append("topic", form.topic); if (courseOfTopic(form.topic)) data.append("courseId", String(courseOfTopic(form.topic))); }
    return api.post(`/ai-agents/${agentId}/kb/upload`, data);
  }, "Arquivo lido e adicionado.");

  return (
    <div>
      <ConfirmationModal title="Remover este documento?" open={!!removing} onClose={() => setRemoving(null)}
        onConfirm={async () => { try { await api.delete(`/ai-agents/${agentId}/kb/${removing.id}`); load(); } catch (e) { toastError(e); } setRemoving(null); }}>
        O agente deixa de usar este conteúdo.
      </ConfirmationModal>
      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="md" fullWidth>
        <DialogTitle>Editar documento</DialogTitle>
        {editing && (
          <DialogContent>
            <TextField fullWidth variant="outlined" margin="dense" label={editing.kind === "faq" ? "Pergunta" : "Título"} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <TextField fullWidth multiline rows={12} variant="outlined" margin="dense" label={editing.kind === "faq" ? "Resposta" : "Conteúdo"} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            {editing.kind === "faq" && <TextField fullWidth variant="outlined" margin="dense" label="Outras formas de perguntar (separe por vírgula)" value={editing.keywords || ""} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} />}
            {editing.kind !== "faq" && <TopicPicker topic={editing.topic} courses={courses} onChange={(t) => setEditing({ ...editing, topic: t })} />}
          </DialogContent>
        )}
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={saveEdit} disabled={!editing || !editing.title.trim() || !editing.content.trim()}>Salvar</Button>
        </DialogActions>
      </Dialog>
      <div className={classes.probe}>
        <Typography variant="subtitle2" gutterBottom>Testar uma pergunta</Typography>
        <Typography className={classes.intro} style={{ marginBottom: 8 }}>Veja quais trechos o agente leria para responder. Se nenhum aparecer, falta conteúdo sobre esse assunto.</Typography>
        <div style={{ display: "flex", gap: 8 }}>
          <TextField fullWidth size="small" variant="outlined" placeholder="Ex.: Como funciona a bolsa para transferência?" value={probe.question} onChange={(e) => setProbe({ question: e.target.value, hits: null })} onKeyDown={(e) => e.key === "Enter" && probe.question.trim() && runProbe()} />
          <Button variant="outlined" color="primary" style={{ whiteSpace: "nowrap", flex: "none" }} startIcon={<Sparkles size={15} />} disabled={!probe.question.trim()} onClick={runProbe}>Ver trechos</Button>
        </div>
        {probe.hits && probe.hits.length === 0 && <Typography variant="body2" color="error" style={{ marginTop: 8 }}>Nenhum trecho encontrado. O agente diria que não sabe e avisaria a equipe.</Typography>}
        {(probe.hits || []).map((h, i) => (<div key={i} className={classes.hit}><div className={classes.hitTitle}>{h.title}</div>{h.content.length > 400 ? `${h.content.slice(0, 400)}…` : h.content}</div>))}
      </div>
      <Typography className={classes.intro}>
        Cole textos, envie arquivos ou aponte uma página. O agente lê só os trechos que combinam com a pergunta do aluno, o que reduz o gasto. <b>Perguntas frequentes</b> são respondidas na hora, sem usar IA.
      </Typography>
      <div className={classes.add}>
        <Tabs value={mode} onChange={(e, v) => setMode(v)} indicatorColor="primary" textColor="primary" variant="scrollable" scrollButtons="off">
          <Tab label="Colar texto" />
          <Tab label="Pergunta frequente" />
          <Tab label="Enviar arquivo" />
          <Tab label="Página da web" />
        </Tabs>
        <TextField fullWidth variant="outlined" margin="dense" label={mode === 1 ? "Pergunta" : "Título"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        {mode === 0 && <TextField fullWidth multiline rows={6} variant="outlined" margin="dense" label="Conteúdo" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />}
        {mode === 1 && (
          <>
            <TextField fullWidth multiline rows={3} variant="outlined" margin="dense" label="Resposta" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <TextField fullWidth variant="outlined" margin="dense" label="Outras formas de perguntar (separe por vírgula)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              helperText="Mensagens curtas com uma destas expressões recebem esta resposta. Ex.: endereço, onde fica" />
          </>
        )}
        {mode === 3 && <TextField fullWidth variant="outlined" margin="dense" label="Endereço da página (https://…)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} helperText="Só endereços públicos. O texto da página é lido uma vez; para atualizar, adicione de novo." />}
        {mode !== 1 && <TopicPicker topic={form.topic} courses={courses} onChange={(t) => setForm({ ...form, topic: t })} />}
        {mode === 2 && <Typography className={classes.intro} style={{ margin: "8px 0" }}>Formatos aceitos: PDF, Word (.docx), .txt, .md, .csv e .html. Até 8 MB.</Typography>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <FormControlLabel control={<Switch color="primary" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />} label={form.shared ? "Todos os agentes usam" : "Só este agente usa"} />
          <span style={{ flex: 1 }} />
          {mode === 2 ? (
            <Button variant="contained" color="primary" component="label" disabled={busy} startIcon={<Upload size={16} />}>
              Escolher arquivo
              <input hidden type="file" accept=".pdf,.docx,.txt,.md,.csv,.html,.htm" onChange={(e) => { if (e.target.files[0]) addFile(e.target.files[0]); e.target.value = ""; }} />
            </Button>
          ) : (
            <Button variant="contained" color="primary" disabled={busy || !form.title.trim() || (mode === 3 ? !form.url.trim() : !form.content.trim())} onClick={[addText, addFaq, null, addUrl][mode]}>
              Adicionar
            </Button>
          )}
        </div>
      </div>
      {docs.length > 5 && (
        <TextField fullWidth size="small" variant="outlined" placeholder="Buscar nos documentos" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
      )}
      <div className={classes.list}>
        {docs.length === 0 && <div className={classes.empty}>Nada aqui ainda. Comece com o calendário, as formas de ingresso e as perguntas que mais chegam.</div>}
        {docs.filter((d) => !q.trim() || d.title.toLowerCase().includes(q.trim().toLowerCase())).map((d) => (
          <div key={d.id} className={classes.doc}>
            <span className={classes.docIcon}>{d.kind === "faq" ? <HelpCircle size={18} /> : d.source === "url" ? <Link2 size={18} /> : <FileText size={18} />}</span>
            <span className={classes.docTitle} title={d.title}>{d.title}</span>
            <Chip size="small" label={d.kind === "faq" ? "Pergunta frequente" : SOURCE[d.source] || d.source} />
            {d.kind !== "faq" && <Chip size="small" variant="outlined" label={`${d.chunks} ${d.chunks === 1 ? "trecho" : "trechos"}`} />}
            {d.topic && <Chip size="small" color="secondary" variant="outlined" label={topicLabel(d.topic, courses)} />}
            {d.shared && <Chip size="small" color="primary" variant="outlined" label="Todos os agentes" />}
            {d.source !== "arquivo" && d.source !== "url" && <IconAction title="Editar documento" onClick={() => openEdit(d)}><Pencil size={16} /></IconAction>}
            <IconAction title="Remover documento" onClick={() => setRemoving(d)}><Trash2 size={16} /></IconAction>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KbTab;
