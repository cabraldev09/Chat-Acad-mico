import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, TextField, Typography, Chip, Tabs, Tab, FormControlLabel, Switch, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, makeStyles } from "@material-ui/core";
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

// Documents the agent can quote. Only the few passages that match each question are sent to the model.
const KbTab = ({ agentId }) => {
  const classes = useStyles();
  const [docs, setDocs] = useState([]);
  const [mode, setMode] = useState(0);
  const [form, setForm] = useState({ title: "", content: "", keywords: "", url: "", shared: false });
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
      await api.put(`/ai-agents/${agentId}/kb/${editing.id}`, { title: editing.title, content: editing.content, keywords: editing.keywords });
      toast.success("Documento atualizado.");
      setEditing(null);
      load();
    } catch (err) { toastError(err); }
  };

  const load = useCallback(() => api.get(`/ai-agents/${agentId}/kb`).then(({ data }) => setDocs(data)).catch(toastError), [agentId]);
  useEffect(() => { load(); }, [load]);

  const reset = () => setForm({ title: "", content: "", keywords: "", url: "", shared: false });
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reset(); load(); } catch (err) { toastError(err); }
    setBusy(false);
  };

  const addText = () => run(() => api.post(`/ai-agents/${agentId}/kb`, { title: form.title, content: form.content, shared: form.shared }), "Documento adicionado.");
  const addFaq = () => run(() => api.post(`/ai-agents/${agentId}/kb`, { kind: "faq", title: form.title, content: form.content, keywords: form.keywords, shared: form.shared }), "Pergunta frequente adicionada.");
  const addUrl = () => run(() => api.post(`/ai-agents/${agentId}/kb/url`, { url: form.url, title: form.title, shared: form.shared }), "Página lida e adicionada.");
  const addFile = (file) => run(() => {
    const data = new FormData();
    data.append("file", file);
    if (form.title) data.append("title", form.title);
    data.append("shared", String(form.shared));
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
