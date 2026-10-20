import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField, Typography, makeStyles } from "@material-ui/core";
import { CheckCircle2, AlertTriangle } from "lucide-react";

import NumberField from "../../components/NumberField";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  row: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: theme.border.divider },
  ok: { color: "#15803d", display: "flex" },
  bad: { color: "#d97706", display: "flex" },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  title: { fontSize: 14, fontWeight: 700, margin: theme.spacing(2, 0, 0.5) },
}));

// Who takes the conversation when the AI agent hands it over: the commercial team of the lead's polo, the reserve queue when the polo has
// no team, and what the system does when nobody answers. "Ready to attend" shows, polo by polo, whether somebody would really answer.
const HandoffDialog = ({ open, onClose }) => {
  const classes = useStyles();
  const [d, setD] = useState(null);
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(null);
    api.get("/ai-handoff").then(({ data }) => { setD(data); setV(data.settings); }).catch(toastError);
  }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/ai-handoff", v);
      setD(data);
      setV(data.settings);
      toast.success("Salvo.");
      onClose();
    } catch (e) { toastError(e); }
    setBusy(false);
  };

  const notReady = d ? d.polos.filter((p) => !p.ready) : [];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Quem assume a conversa</DialogTitle>
      <DialogContent dividers>
        {!d && <CircularProgress size={22} />}
        {d && v && (
          <>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Quando o agente passa a conversa para uma pessoa, o sistema acha o polo pela cidade, escolhe um consultor do comercial daquele polo, avisa na hora e cria uma tarefa. Se o polo não tem equipe, a conversa continua na fila do polo e só a gestão é avisada. Lead de cidade que nenhum polo atende (ou só EAD) vai para a fila central.
            </Typography>

            <div className={classes.title}>Pronto para atender</div>
            {d.polos.length === 0 && <div className={classes.hint}>Nenhum polo ativo cadastrado.</div>}
            {d.polos.map((p) => (
              <div key={p.id} className={classes.row}>
                <span className={p.ready ? classes.ok : classes.bad}>{p.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div className={classes.hint}>{p.ready ? `${p.queue.people} consultor(es) na fila “${p.queue.name}”` : p.issue}</div>
                </div>
              </div>
            ))}
            {notReady.length > 0 && (
              <Typography variant="body2" style={{ marginTop: 8 }}>
                {notReady.length} polo(s) sem equipe comercial: as conversas deles ficam na fila do próprio polo e a gestão é avisada. Cadastre consultores nesses polos. Quem não tem polo vai para {d.reserve ? `a fila central “${d.reserve.name}”` : "a primeira fila comercial com consultores (escolha uma fila central abaixo)"}.
              </Typography>
            )}

            <div className={classes.title}>Fila central</div>
            <TextField select fullWidth size="small" variant="outlined" value={v.fallbackQueueId || ""} onChange={(e) => setV({ ...v, fallbackQueueId: e.target.value || null })} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
              helperText="Recebe a conversa do lead cuja cidade nenhum polo atende (ou que quer só EAD) e quando o polo não pôde ser descoberto.">
              <MenuItem value="">Automática: a primeira fila comercial que tem consultores</MenuItem>
              {d.queues.map((q) => <MenuItem key={q.id} value={q.id}>{q.name}{q.polo ? ` · ${q.polo}` : ""} ({q.people})</MenuItem>)}
            </TextField>

            <div className={classes.title}>Se ninguém atender</div>
            <div style={{ display: "flex", gap: 8 }}>
              <NumberField fullWidth size="small" variant="outlined" label="Avisar após (minutos úteis)" InputLabelProps={{ shrink: true }} value={v.slaMinutes} onChange={(n) => setV({ ...v, slaMinutes: n })} />
              <NumberField fullWidth size="small" variant="outlined" label="Encerrar conversa parada após (dias)" InputLabelProps={{ shrink: true }} value={v.staleDays} onChange={(n) => setV({ ...v, staleDays: n })} />
            </div>
            <Typography className={classes.hint} display="block">
              Passado o prazo, o consultor, a fila e a gestão recebem um aviso; no segundo prazo a conversa passa para o próximo consultor da fila. Zero desliga. A conversa parada do agente vira “Sem resposta” com uma tarefa.
            </Typography>

            <div className={classes.title}>Mensagens de voz</div>
            <FormControlLabel control={<Switch color="primary" checked={!!v.transcribe} disabled={!d.openaiKey} onChange={(e) => setV({ ...v, transcribe: e.target.checked })} />} label="Entender áudios (transcrever com a chave da OpenAI)" />
            <Typography className={classes.hint} display="block">
              {d.openaiKey ? "O áudio é enviado à OpenAI só para virar texto. Desligado, o agente pede que a pessoa escreva e, no segundo áudio, chama um consultor." : "Cadastre a chave da OpenAI em Agentes de IA para ligar. Sem isso o agente pede que a pessoa escreva."}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Fechar</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy || !d}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HandoffDialog;
