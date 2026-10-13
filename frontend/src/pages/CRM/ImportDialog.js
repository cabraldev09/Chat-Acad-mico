import React, { useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress } from "@material-ui/core";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const HEADERS = {
  nome: "name", name: "name", telefone: "phone", celular: "phone", whatsapp: "phone", phone: "phone",
  email: "email", "e-mail": "email", curso: "course", course: "course", cidade: "city", city: "city",
  uf: "state", estado: "state", origem: "source", source: "source", modalidade: "modality",
  turno: "shift", ingresso: "entryTerm", observacoes: "notes", "observações": "notes", obs: "notes",
};

export const parseLeads = (text) => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = [";", "\t", ","].find((d) => lines[0].includes(d)) || ",";
  const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const first = split(lines[0]).map((h) => HEADERS[h.toLowerCase()]);
  const hasHeader = first.some(Boolean);
  const cols = hasHeader ? first : ["name", "phone", "email", "course"];
  return lines.slice(hasHeader ? 1 : 0).map((l) => {
    const row = {};
    split(l).forEach((v, i) => { if (cols[i] && v) row[cols[i]] = v; });
    return row;
  });
};

const ImportDialog = ({ open, onClose, onDone }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/leads/import", { items: parseLeads(text) });
      setReport(data);
      toast.success(`${data.created} novos, ${data.updated} atualizados`);
      onDone && onDone();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setText(""); setReport(null); onClose(); };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>Importar leads</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Cole as linhas ou envie um .csv. Cabeçalhos aceitos: nome, telefone, email, curso, cidade, uf, origem, modalidade, turno, ingresso.
          Sem cabeçalho, a ordem é nome; telefone; email; curso. Quem já existe (mesmo telefone ou e-mail) é atualizado, não duplicado.
        </Typography>
        <TextField fullWidth multiline rows={7} variant="outlined" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"nome;telefone;email;curso\nMaria Souza;(11) 99999-0000;maria@email.com;Direito"} />
        <Button component="label" variant="outlined" size="small" style={{ marginTop: 8 }}>
          Escolher arquivo CSV
          <input hidden type="file" accept=".csv,.txt" onChange={async (e) => { const f = e.target.files[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
        </Button>
        {text && <Typography variant="caption" color="textSecondary" style={{ marginLeft: 8 }}>{parseLeads(text).length} linhas reconhecidas</Typography>}
        {report && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <b>{report.created}</b> criados · <b>{report.updated}</b> atualizados · <b>{report.skipped}</b> ignorados
            {report.errors.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#b45309", fontSize: 13 }}>{report.errors.map((e) => (<li key={e}>{e}</li>))}</ul>}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={close}>Fechar</Button>
        <Button variant="contained" color="primary" onClick={run} disabled={busy || !text.trim()}>
          {busy ? <CircularProgress size={18} /> : "Importar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportDialog;
