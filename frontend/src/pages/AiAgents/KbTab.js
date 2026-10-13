import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, TextField, Typography, Chip, Tabs, Tab, FormControlLabel, Switch, makeStyles } from "@material-ui/core";
import { Trash2, FileText, HelpCircle, Link2, Upload } from "lucide-react";

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
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(3, 1), fontSize: 14 },
}));

const SOURCE = { texto: "Texto", arquivo: "Arquivo", url: "Página da web" };

// Documents the agent can quote. Only the few passages that match each question are sent to the model.
const KbTab = ({ agentId }) => {
  const classes = useStyles();
  const [docs, setDocs] = useState([]);
  const [mode, setMode] = useState(0);
  const [form, setForm] = useState({ title: "", content: "", keywords: "", url: "", shared: false });
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

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
      <div className={classes.list}>
        {docs.length === 0 && <div className={classes.empty}>Nada aqui ainda. Comece com o calendário, as formas de ingresso e as perguntas que mais chegam.</div>}
        {docs.map((d) => (
          <div key={d.id} className={classes.doc}>
            <span className={classes.docIcon}>{d.kind === "faq" ? <HelpCircle size={18} /> : d.source === "url" ? <Link2 size={18} /> : <FileText size={18} />}</span>
            <span className={classes.docTitle} title={d.title}>{d.title}</span>
            <Chip size="small" label={d.kind === "faq" ? "Pergunta frequente" : SOURCE[d.source] || d.source} />
            {d.kind !== "faq" && <Chip size="small" variant="outlined" label={`${d.chunks} ${d.chunks === 1 ? "trecho" : "trechos"}`} />}
            {d.shared && <Chip size="small" color="primary" variant="outlined" label="Todos os agentes" />}
            <IconAction title="Remover documento" onClick={() => setRemoving(d)}><Trash2 size={16} /></IconAction>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KbTab;
