import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Typography,
  CircularProgress, makeStyles, RadioGroup, Radio, FormControlLabel, Switch,
} from "@material-ui/core";
import { GraduationCap } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  head: { display: "flex", alignItems: "center", gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a", background: "rgba(22,163,74,.14)" },
  section: { margin: theme.spacing(2, 0, 0.5), fontSize: 13, fontWeight: 700, color: theme.palette.text.secondary },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  feeBox: { padding: theme.spacing(0.5, 1.5), borderRadius: 12, border: `1px solid ${theme.palette.divider}`, marginTop: 6 },
}));

// "Confirmar matrícula": picks the polo and tutor, settles the enrollment fee and hands the student over.
// "additional": the student is already enrolled and enrolls again (another course): it counts again and the tutor gets a new task.
const EnrollDialog = ({ open, lead, onClose, onDone, additional = false }) => {
  const classes = useStyles();
  const [polos, setPolos] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [courses, setCourses] = useState([]);
  const [v, setV] = useState({ poloId: "", tutorId: "auto", fee: "paid", feeDueDate: "", note: "", courseId: "" });

  useEffect(() => {
    if (!open) return;
    setV({ poloId: lead.poloId || "", tutorId: "auto", fee: "paid", feeDueDate: "", note: "", courseId: "" });
    if (additional) api.get("/courses").then(({ data }) => setCourses(data.filter((c) => c.active))).catch(() => undefined);
    api.get("/polos").then(({ data }) => setPolos(data.filter((p) => p.active))).catch(toastError);
    // the board card is a summary: the CPF and polo come from the full record
    api.get(`/leads/${lead.id}`).then(({ data }) => {
      setDetail(data);
      if (data.poloId) setV((cur) => ({ ...cur, poloId: cur.poloId || data.poloId }));
    }).catch(() => setDetail(null));
  }, [open, lead, additional]);

  useEffect(() => {
    if (!v.poloId) { setTutors([]); return; }
    api.get(`/polos/${v.poloId}/tutors`).then(({ data }) => setTutors(data)).catch(() => setTutors([]));
  }, [v.poloId]);

  const first = (lead.name || "").split(" ")[0];
  const needsCpf = !additional && (v.fee === "now" || v.fee === "later") && !(detail && detail.cpf);
  const invalid = !v.poloId || (additional && !v.courseId) || (v.fee === "later" && !v.feeDueDate) || needsCpf;

  const confirm = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/enroll`, {
        poloId: v.poloId,
        tutorId: v.tutorId,
        fee: additional ? undefined : v.fee,
        feeDueDate: v.feeDueDate || null,
        note: v.note,
        additional: additional || undefined,
        courseId: additional ? v.courseId : undefined
      });
      toast.success(additional ? `Nova matrícula registrada (${data.number}ª). ${data.tutor ? `Tutor: ${data.tutor.name}.` : "Aguardando um tutor."}` : data.tutor ? `Matrícula confirmada. Tutor: ${data.tutor.name}.` : "Matrícula confirmada. Aguardando um tutor na fila.");
      (data.warnings || []).forEach((w) => toast.warn(w));
      onDone && onDone(data);
      onClose();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <div className={classes.head}>
          <span className={classes.badge}><GraduationCap size={22} /></span>
          <div>
            {additional ? "Nova matrícula" : "Confirmar matrícula"}
            <Typography variant="body2" color="textSecondary">{lead.name}</Typography>
          </div>
        </div>
      </DialogTitle>
      <DialogContent>
        {additional && (
          <>
            <div className={classes.section}>Curso desta matrícula</div>
            <TextField select fullWidth variant="outlined" margin="dense" label="Curso" value={v.courseId} onChange={(e) => setV({ ...v, courseId: e.target.value })}
              helperText="O aluno continua com a primeira matrícula; esta conta como mais uma para você e para o polo.">
              {courses.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
            </TextField>
          </>
        )}
        <div className={classes.section}>Quem vai ambientar o aluno</div>
        <TextField select fullWidth variant="outlined" margin="dense" label="Polo" value={v.poloId} onChange={(e) => setV({ ...v, poloId: e.target.value, tutorId: "auto" })}
          helperText={polos.length ? "O aluno vai para a fila de tutoria deste polo." : "Cadastre os polos em Polos e equipes."}>
          {polos.map((p) => (<MenuItem key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ""}</MenuItem>))}
        </TextField>
        <TextField select fullWidth variant="outlined" margin="dense" label="Tutor" value={v.tutorId} onChange={(e) => setV({ ...v, tutorId: e.target.value })} disabled={!v.poloId}
          helperText={v.poloId && !tutors.length ? "Este polo ainda não tem tutor: o aluno ficará aguardando na fila." : "Automático segue a regra de distribuição da fila (rodízio ou menos ocupado)."}>
          <MenuItem value="auto">Automático (rodízio da tutoria)</MenuItem>
          {tutors.map((t) => (<MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>))}
        </TextField>

        {!additional && <div className={classes.section}>Taxa de matrícula</div>}
        {!additional && <div className={classes.feeBox}>
          <RadioGroup value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })}>
            <FormControlLabel value="paid" control={<Radio color="primary" />} label="Já foi paga (ou será tratada fora do sistema)" />
            <FormControlLabel value="now" control={<Radio color="primary" />} label="Gerar a cobrança agora (boleto com Pix)" />
            <FormControlLabel value="later" control={<Radio color="primary" />} label="Pagar depois: data combinada com o aluno" />
            <FormControlLabel value="exempt" control={<Radio color="primary" />} label="Matrícula isenta (não cobrar a taxa)" />
          </RadioGroup>
          {v.fee === "exempt" && <div className={classes.hint} style={{ margin: "0 0 8px" }}>Nenhuma cobrança é gerada. O aluno fica com a etiqueta “Matrícula isenta”.</div>}
          {v.fee === "later" && (
            <TextField fullWidth type="date" variant="outlined" margin="dense" label="Vencimento combinado" InputLabelProps={{ shrink: true }} value={v.feeDueDate} onChange={(e) => setV({ ...v, feeDueDate: e.target.value })}
              helperText="Você recebe um aviso para enviar o boleto alguns dias antes do vencimento." />
          )}
          {needsCpf && <div className={classes.hint} style={{ color: "#dc2626" }}>Informe o CPF na ficha do lead para gerar a cobrança.</div>}
        </div>}

        <div className={classes.section}>Passagem de bastão</div>
        <TextField fullWidth multiline rows={2} variant="outlined" margin="dense" label="Observação para o tutor (opcional)" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })}
          helperText="Aparece no histórico. Ex.: prefere à noite, já tem notebook." />
        <div className={classes.hint}>Nenhuma mensagem é enviada ao aluno agora. O tutor recebe a conversa com o texto de boas-vindas pronto e envia quando quiser. Daqui para frente o consultor não vê as mensagens do tutor, e o tutor não vê as suas; o contato com o aluno volta a você depois da ambientação.</div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={confirm} disabled={busy || invalid}>
          {busy ? <CircularProgress size={18} /> : additional ? "Registrar nova matrícula" : "Confirmar matrícula"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EnrollDialog;
