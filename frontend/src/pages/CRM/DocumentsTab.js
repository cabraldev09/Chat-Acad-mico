import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, LinearProgress, Typography, makeStyles, CircularProgress } from "@material-ui/core";
import { CheckCircle2, Circle, MinusCircle, Send } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  hint: { color: theme.palette.text.secondary, fontSize: 13 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: theme.border.divider },
  name: { flex: 1, minWidth: 0, fontSize: 14, overflowWrap: "anywhere" },
  done: { color: "#16a34a" },
  waived: { color: theme.palette.text.secondary },
  btn: { minWidth: 0, padding: "2px 8px", fontSize: 12.5 },
  bar: { height: 8, borderRadius: 8, margin: "8px 0 4px" },
}));

const LABEL = { pending: "Pendente", received: "Recebido", waived: "Dispensado" };

// The documents the student has to deliver: what came, what is missing, and the button that asks for the missing ones by WhatsApp.
const DocumentsTab = ({ lead, onChanged }) => {
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { const { data: d } = await api.get(`/leads/${lead.id}/documents`); setData(d); } catch (err) { toastError(err); }
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);

  const set = async (doc, status) => {
    setBusy(`d${doc.id}`);
    try { const { data: d } = await api.put(`/leads/${lead.id}/documents/${doc.id}`, { status }); setData(d); onChanged && onChanged(); } catch (err) { toastError(err); }
    setBusy("");
  };
  const remind = async () => {
    setBusy("remind");
    try { const { data: d } = await api.post(`/leads/${lead.id}/documents/remind`); toast.success(`Cobrança enviada: ${d.missing} documento${d.missing > 1 ? "s" : ""} pendente${d.missing > 1 ? "s" : ""}.`); onChanged && onChanged(); } catch (err) { toastError(err); }
    setBusy("");
  };

  if (!data) return <div style={{ textAlign: "center", padding: 32 }}><CircularProgress size={24} /></div>;
  const s = data.summary;
  const delivered = s.received + s.waived;

  return (
    <div>
      <Typography style={{ fontWeight: 600 }}>
        {s.total === 0 ? "Nenhum documento cadastrado" : s.complete ? "Documentos completos" : `${delivered} de ${s.total} documentos`}
      </Typography>
      {s.total > 0 && <LinearProgress className={classes.bar} variant="determinate" value={Math.round((delivered / s.total) * 100)} />}
      <div className={classes.hint}>
        {!lead.enrolledAt ? "A lista vale a partir da confirmação da matrícula. Você já pode ir marcando o que o aluno enviar." : s.complete ? "Tudo certo: a etiqueta “Documentos pendentes” saiu do aluno." : "Enquanto houver documento pendente, o aluno fica com a etiqueta “Documentos pendentes”."}
      </div>

      <div style={{ marginTop: 10 }}>
        {data.documents.map((d) => (
          <div key={d.id} className={classes.row}>
            {d.status === "received" ? <CheckCircle2 size={18} className={classes.done} /> : d.status === "waived" ? <MinusCircle size={18} className={classes.waived} /> : <Circle size={18} />}
            <div className={classes.name}>
              <div>{d.name}</div>
              <div className={classes.hint}>{LABEL[d.status]}</div>
            </div>
            {d.status !== "received" && <Button size="small" variant="outlined" className={classes.btn} disabled={busy === `d${d.id}`} onClick={() => set(d, "received")}>Recebi</Button>}
            {d.status === "pending" && <Button size="small" className={classes.btn} disabled={busy === `d${d.id}`} onClick={() => set(d, "waived")}>Dispensar</Button>}
            {d.status !== "pending" && <Button size="small" className={classes.btn} disabled={busy === `d${d.id}`} onClick={() => set(d, "pending")}>Desfazer</Button>}
          </div>
        ))}
      </div>

      {s.pending > 0 && (
        <Button style={{ marginTop: 14 }} variant="contained" color="primary" size="small" startIcon={busy === "remind" ? <CircularProgress size={14} /> : <Send size={15} />} disabled={busy === "remind"} onClick={remind}>
          Cobrar os documentos pendentes
        </Button>
      )}
    </div>
  );
};

export default DocumentsTab;
