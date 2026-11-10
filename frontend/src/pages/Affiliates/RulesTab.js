import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, IconButton, MenuItem, Paper, TextField, Typography } from "@material-ui/core";
import { Plus, Trash2 } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { useStyles } from "./shared";

const RulesTab = () => {
  const classes = useStyles();
  const [f, setF] = useState(null);
  useEffect(() => { api.get("/affiliate-rules").then(({ data }) => { const d = data && typeof data === "object" ? data : {}; setF({ ...d, faqEdit: d.customFaq && Array.isArray(d.faq) ? d.faq : [] }); }).catch(toastError); }, []);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    try { const { data } = await api.put("/affiliate-rules", { ...f, faq: f.faqEdit || [] }); setF({ ...data, faqEdit: data.customFaq ? data.faq : [] }); toast.success("Regras salvas."); } catch (err) { toastError(err); }
  };

  return (
    <div className={classes.body}>
      <Paper variant="outlined" style={{ padding: 20, maxWidth: 640, animation: "page-in .4s var(--ease-out) both" }}>
        <Typography variant="subtitle1" style={{ fontWeight: 700 }} gutterBottom>Bonificação por matrícula</Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          A regra vale para todos, a não ser que o afiliado tenha um valor próprio ou que uma campanha no ar pague mais. O pagamento é feito por fora e registrado na aba Bonificações.
        </Typography>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
          <TextField select label="Como calcular" value={f.mode} onChange={set("mode")} variant="outlined" margin="dense">
            <MenuItem value="fixed">Valor fixo por matrícula</MenuItem>
            <MenuItem value="pct">Percentual da mensalidade do curso</MenuItem>
            <MenuItem value="first_monthly">Valor da 1ª mensalidade da proposta</MenuItem>
          </TextField>
          {f.mode === "first_monthly" ? (
            <TextField label="Pagar em até (dias)" type="number" value={f.payDays} onChange={set("payDays")} variant="outlined" margin="dense" helperText="Depois da confirmação da matrícula" />
          ) : (
            <TextField label={f.mode === "pct" ? "Percentual (%)" : "Valor (R$)"} type="number" value={f.value} onChange={set("value")} variant="outlined" margin="dense" />
          )}
          <TextField select label="Quando passa a valer" value={f.trigger} onChange={set("trigger")} variant="outlined" margin="dense">
            <MenuItem value="enrolled">Quando a matrícula é confirmada</MenuItem>
            <MenuItem value="fee_paid">Só depois que a taxa de matrícula é paga</MenuItem>
          </TextField>
          <TextField select label="Forma de pagamento" value={f.kind} onChange={set("kind")} variant="outlined" margin="dense">
            <MenuItem value="bonus">Bonificação</MenuItem>
            <MenuItem value="pix">Pix na chave do afiliado</MenuItem>
          </TextField>
        </div>
        <Typography variant="subtitle1" style={{ fontWeight: 700, marginTop: 24 }} gutterBottom>Texto do portal</Typography>
        <TextField label="Título" value={f.portalTitle} onChange={set("portalTitle")} fullWidth variant="outlined" margin="dense" inputProps={{ maxLength: 80 }} />
        <TextField label="Mensagem de boas-vindas" value={f.portalMessage} onChange={set("portalMessage")} fullWidth multiline rows={2} variant="outlined" margin="dense" inputProps={{ maxLength: 300 }} />
        <Typography variant="subtitle1" style={{ fontWeight: 700, marginTop: 24 }} gutterBottom>Central do Afiliado</Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          O que o afiliado vê em Orientações. Sem valores, bolsas ou condições. Deixe as perguntas vazias para usar as padrão.
        </Typography>
        <TextField label="Vídeo “Como funciona o programa” (link do YouTube)" value={f.videoProgram || ""} onChange={set("videoProgram")} fullWidth variant="outlined" margin="dense" placeholder="https://youtu.be/..." />
        <TextField label="Vídeo “Como usar os materiais” (link do YouTube)" value={f.videoTutorial || ""} onChange={set("videoTutorial")} fullWidth variant="outlined" margin="dense" placeholder="https://youtu.be/..." />
        <TextField label="WhatsApp do suporte (com DDD)" value={f.supportPhone || ""} onChange={(e) => setF({ ...f, supportPhone: e.target.value })} fullWidth variant="outlined" margin="dense" placeholder="(69) 99999-0000" helperText="Aparece no botão “Falar com o suporte”. Sem ele, o botão não aparece." />
        <Typography variant="body2" style={{ fontWeight: 600, marginTop: 12 }}>Perguntas frequentes</Typography>
        {(f.faqEdit || []).map((item, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 34px", gap: 8, alignItems: "start", marginBottom: 8 }}>
            <div>
              <TextField label="Pergunta" value={item.q} onChange={(e) => setF({ ...f, faqEdit: f.faqEdit.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} fullWidth variant="outlined" margin="dense" />
              <TextField label="Resposta" value={item.a} onChange={(e) => setF({ ...f, faqEdit: f.faqEdit.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} fullWidth multiline rows={2} variant="outlined" margin="dense" />
            </div>
            <IconButton size="small" aria-label="Remover pergunta" onClick={() => setF({ ...f, faqEdit: f.faqEdit.filter((_, j) => j !== i) })}><Trash2 size={16} /></IconButton>
          </div>
        ))}
        <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={() => setF({ ...f, faqEdit: [...(f.faqEdit || []), { q: "", a: "" }] })}>Adicionar pergunta</Button>
        <br />
        <Button variant="contained" color="primary" onClick={save} style={{ marginTop: 16 }}>Salvar regras</Button>
      </Paper>
    </div>
  );
};

export default RulesTab;
