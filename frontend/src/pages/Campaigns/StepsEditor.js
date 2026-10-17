import React, { useState } from "react";
import { Button, TextField, MenuItem, Typography, makeStyles } from "@material-ui/core";
import { Plus, ArrowUp, ArrowDown, Trash2, Paperclip, X } from "lucide-react";

import IconAction from "../../components/IconAction";
import api from "../../services/api";
import toastError from "../../errors/toastError";

export const MAX_STEPS = 5;
export const emptyStep = () => ({ type: "text", body: "", mediaUrl: null, mediaName: "", delaySec: 8 });

const DELAYS = [
  { value: 3, label: "3 segundos" },
  { value: 8, label: "8 segundos" },
  { value: 20, label: "20 segundos" },
  { value: 60, label: "1 minuto" },
  { value: 180, label: "3 minutos" },
];

const useStyles = makeStyles((theme) => ({
  intro: { fontSize: 13, color: theme.palette.text.secondary, margin: theme.spacing(0.5, 0, 1.5) },
  step: { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, padding: theme.spacing(1.5), marginBottom: theme.spacing(1.5), backgroundColor: theme.palette.background.paper },
  head: { display: "flex", alignItems: "center", gap: theme.spacing(0.5), marginBottom: theme.spacing(0.5) },
  num: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: "#fff", background: theme.palette.primary.main, flex: "none" },
  title: { flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0 },
  delay: { minWidth: 150, marginBottom: theme.spacing(0.5) },
  file: { display: "flex", alignItems: "center", gap: theme.spacing(0.5), fontSize: 13, marginTop: theme.spacing(0.5), minWidth: 0 },
  fileName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  previewTitle: { fontSize: 13, fontWeight: 700, margin: theme.spacing(1.5, 0, 0.75) },
  chat: { borderRadius: 14, padding: theme.spacing(1.5), display: "flex", flexDirection: "column", gap: 6, background: theme.palette.type === "dark" ? "#0b141a" : "#efeae2" },
  bubble: { alignSelf: "flex-start", maxWidth: "88%", padding: "6px 10px", borderRadius: "10px 10px 10px 2px", fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word", background: theme.palette.type === "dark" ? "#202c33" : "#fff", color: theme.palette.text.primary, boxShadow: "0 1px 0.5px rgba(11,20,26,.18)" },
  wait: { alignSelf: "center", fontSize: 11.5, color: theme.palette.text.secondary },
}));

// the same variables the sender fills in, with sample data
const sample = (text) =>
  String(text || "")
    .replace(/\{\{\s*spin\s*\|([^}]*)\}\}/gi, (_m, o) => o.split("|").map((x) => x.trim()).filter(Boolean)[0] || "")
    .replace(/\{\{\s*(name|nome)\s*\}\}/g, "Maria Souza")
    .replace(/\{\{\s*(primeiro_nome|first_name)\s*\}\}/g, "Maria")
    .replace(/\{\{\s*number\s*\}\}/g, "5569999990000");

const StepsEditor = ({ steps, onChange, riskNote }) => {
  const classes = useStyles();
  const [busy, setBusy] = useState(null);
  const set = (i, patch) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  const upload = async (i, file) => {
    if (!file) return;
    setBusy(i);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads", form);
      set(i, { mediaUrl: data.filename, mediaName: data.originalname, type: "media" });
    } catch (err) {
      toastError(err);
    }
    setBusy(null);
  };

  return (
    <div>
      <Typography className={classes.intro}>
        Cada pessoa recebe as mensagens na ordem, com uma pausa entre elas. Use <b>{"{{name}}"}</b> para o nome, <b>{"{{primeiro_nome}}"}</b> para só o primeiro nome e <b>{"{{spin|Olá|Oi|E aí}}"}</b> para variar o texto entre os destinatários.
        {riskNote ? ` ${riskNote}` : ""}
      </Typography>
      {steps.map((s, i) => (
        <div key={i} className={classes.step}>
          <div className={classes.head}>
            <span className={classes.num}>{i + 1}</span>
            <span className={classes.title}>{i === 0 ? "Primeira mensagem" : `Mensagem ${i + 1}`}</span>
            <IconAction title="Subir esta mensagem" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></IconAction>
            <IconAction title="Descer esta mensagem" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></IconAction>
            <IconAction title="Remover esta mensagem" disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 size={16} /></IconAction>
          </div>
          {i > 0 && (
            <TextField select variant="outlined" margin="dense" size="small" className={classes.delay} label="Enviar depois de" value={s.delaySec} onChange={(e) => set(i, { delaySec: Number(e.target.value) })}>
              {DELAYS.map((d) => (<MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>))}
            </TextField>
          )}
          <TextField
            fullWidth multiline rows={3} variant="outlined" margin="dense"
            label={s.mediaUrl ? "Legenda (opcional)" : "Texto"}
            value={s.body}
            onChange={(e) => set(i, { body: e.target.value })}
          />
          <div className={classes.file}>
            <Button size="small" variant="outlined" component="label" startIcon={<Paperclip size={15} />} disabled={busy === i}>
              {s.mediaUrl ? "Trocar anexo" : "Anexar imagem, vídeo ou documento"}
              <input hidden type="file" onChange={(e) => { upload(i, e.target.files[0]); e.target.value = ""; }} />
            </Button>
            {s.mediaUrl && (
              <>
                <span className={classes.fileName} title={s.mediaName || s.mediaUrl}>{s.mediaName || s.mediaUrl}</span>
                <IconAction title="Remover anexo" onClick={() => set(i, { mediaUrl: null, mediaName: "", type: "text" })}><X size={15} /></IconAction>
              </>
            )}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="small" variant="outlined" color="primary" startIcon={<Plus size={15} />} disabled={steps.length >= MAX_STEPS} onClick={() => onChange([...steps, emptyStep()])}>
          {steps.length >= MAX_STEPS ? `Limite de ${MAX_STEPS} mensagens` : "Adicionar mensagem"}
        </Button>
        <Button size="small" variant="outlined" disabled={steps.some((x) => /\bSAIR\b/.test(x.body))}
          title="Escreve no fim da última mensagem como a pessoa pede para não receber mais"
          onClick={() => { const last = steps.length - 1; set(last, { body: `${steps[last].body.trimEnd()}${steps[last].body.trim() ? "\n\n" : ""}Para não receber mais mensagens, responda SAIR.` }); }}>
          {steps.some((x) => /\bSAIR\b/.test(x.body)) ? "Aviso de saída incluído" : "Incluir aviso para sair da lista"}
        </Button>
      </div>

      <div className={classes.previewTitle}>Como a pessoa vai receber</div>
      <div className={classes.chat}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className={classes.wait}>depois de {(DELAYS.find((d) => d.value === s.delaySec) || { label: `${s.delaySec} s` }).label}</span>}
            <div className={classes.bubble}>
              {s.mediaUrl && <div style={{ opacity: 0.7, marginBottom: s.body ? 4 : 0 }}>📎 {s.mediaName || "anexo"}</div>}
              {sample(s.body) || (s.mediaUrl ? "" : <i style={{ opacity: 0.6 }}>Mensagem vazia</i>)}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default StepsEditor;
