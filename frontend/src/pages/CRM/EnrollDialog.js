import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Typography,
  CircularProgress, makeStyles, RadioGroup, Radio, FormControlLabel, Checkbox, ListSubheader,
} from "@material-ui/core";
import { GraduationCap, ImagePlus, CheckCircle2, AlertTriangle } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  head: { display: "flex", alignItems: "center", gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a", background: "rgba(22,163,74,.14)" },
  section: { margin: theme.spacing(2, 0, 0.5), fontSize: 13, fontWeight: 700, color: theme.palette.text.secondary },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  drop: { display: "flex", alignItems: "center", gap: 12, padding: theme.spacing(1.5), borderRadius: 12, border: `1.5px dashed ${theme.palette.divider}`, cursor: "pointer", transition: "border-color .15s, background .15s", "&:hover": { borderColor: "#4595D8", background: "rgba(69,149,216,.06)", outline: "none" } },
  dropOn: { borderColor: "#4595D8", background: "rgba(69,149,216,.08)" },
  thumb: { width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${theme.palette.divider}`, flex: "none" },
  feeBox: { padding: theme.spacing(0.5, 1.5), borderRadius: 12, border: `1px solid ${theme.palette.divider}`, marginTop: 6 },
}));

// "Confirmar matrícula e enviar para a tutoria": the consultant checks the student's record (contact, course, polo), informs the RGM that the
// institution gave the student, settles the fee and hands the student over. The RGM creates the student of the portal; the tutor then only
// informs the academic e-mail of access.
// "additional": the student is already enrolled and enrolls again (another course): it counts again and the tutor gets a new task.
const EnrollDialog = ({ open, lead, onClose, onDone, additional = false }) => {
  const classes = useStyles();
  const [polos, setPolos] = useState([]);
  const [tutors, setTutors] = useState([]);
  // every tutor of the institution, for "another tutor" (one of another polo, who then joins this polo's tutoring)
  const [allTutors, setAllTutors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [courses, setCourses] = useState([]);
  const [v, setV] = useState({ poloId: "", tutorId: "auto", fee: "paid", feeDueDate: "", note: "", courseId: "", rgm: "" });
  // the print of the enrollment: read when attached (the RGM fills the field); kept with the enrollment for the management
  const [proof, setProof] = useState(null); // { id, preview, reading, readNote }
  const [reading, setReading] = useState(false);
  const [noProof, setNoProof] = useState(false);
  const [over, setOver] = useState(false);
  const input = React.useRef(null);
  const attach = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$|^application\/pdf$/.test(file.type)) { toast.error("Envie uma imagem (PNG, JPG ou WEBP) ou um PDF."); return; }
    setReading(true);
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/leads/${lead.id}/enrollment-proof`, form);
      setProof({ ...data, preview, name: file.name });
      setNoProof(false);
      if (data.reading && data.reading.rgm) setV((cur) => ({ ...cur, rgm: data.reading.rgm }));
    } catch (err) { toastError(err); }
    setReading(false);
  };

  useEffect(() => {
    if (!open) return;
    setV({ poloId: lead.poloId || "", tutorId: "auto", fee: "paid", feeDueDate: "", note: "", courseId: "", rgm: "" });
    setProof(null); setNoProof(false);
    api.get("/courses").then(({ data }) => setCourses(data.filter((c) => c.active))).catch(() => undefined);
    api.get("/polos").then(({ data }) => setPolos(data.filter((p) => p.active))).catch(toastError);
    // the board card is a summary: the CPF and polo come from the full record
    api.get(`/leads/${lead.id}`).then(({ data }) => {
      setDetail(data);
      setV((cur) => ({ ...cur, poloId: cur.poloId || data.poloId || "", courseId: cur.courseId || (!additional && data.courseId) || "", rgm: cur.rgm || (!additional && data.rgm) || "" }));
    }).catch(() => setDetail(null));
  }, [open, lead, additional]);

  useEffect(() => {
    if (!v.poloId) { setTutors([]); return; }
    api.get(`/polos/${v.poloId}/tutors`).then(({ data }) => setTutors(data)).catch(() => setTutors([]));
  }, [v.poloId]);
  useEffect(() => {
    if (!open) return;
    api.get("/tutors").then(({ data }) => setAllTutors(Array.isArray(data) ? data : [])).catch(() => setAllTutors([]));
  }, [open]);
  const others = allTutors.filter((t) => !tutors.some((x) => x.id === t.id && !x.outside));
  const isOther = others.some((t) => t.id === v.tutorId) || tutors.some((t) => t.id === v.tutorId && t.outside);

  const needsCpf = !additional && (v.fee === "now" || v.fee === "later") && !(detail && detail.cpf);
  const rgm = String(v.rgm || "").replace(/\s+/g, "");
  const rgmOk = /^[A-Za-z0-9.\-/]{3,40}$/.test(rgm);
  const invalid = !v.poloId || !v.courseId || !rgmOk || (v.fee === "later" && !v.feeDueDate) || needsCpf || reading || (!proof && !noProof);

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
        courseId: v.courseId,
        rgm,
        proofId: proof ? proof.id : undefined
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
            {additional ? "Nova matrícula" : "Confirmar matrícula e enviar para a tutoria"}
            <Typography variant="body2" color="textSecondary">{lead.name}</Typography>
          </div>
        </div>
      </DialogTitle>
      <DialogContent onPaste={(e) => { const f = Array.from(e.clipboardData.files || [])[0]; if (f) { e.preventDefault(); attach(f); } }}>
        <div className={classes.section} style={{ marginTop: 4 }}>Print da matrícula</div>
        <div role="button" tabIndex={0} aria-label="Anexar o print da matrícula" className={`${classes.drop} ${over ? classes.dropOn : ""}`}
          onClick={() => input.current && input.current.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current && input.current.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); attach(e.dataTransfer.files[0]); }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={(e) => { attach(e.target.files[0]); e.target.value = ""; }} />
          {proof && proof.preview ? <img src={proof.preview} alt="Print anexado" className={classes.thumb} /> : <ImagePlus size={26} style={{ color: "#4595D8", flex: "none" }} />}
          <div style={{ minWidth: 0 }}>
            {reading ? <><b>Lendo o print…</b><div className={classes.hint}>A IA procura o RGM, o nome e o curso.</div></> : proof ? (
              <>
                <b style={{ display: "flex", alignItems: "center", gap: 6 }}>{proof.reading && proof.reading.rgm ? <CheckCircle2 size={16} color="#16a34a" /> : <AlertTriangle size={16} color="#d97706" />} {proof.reading && proof.reading.rgm ? `RGM lido: ${proof.reading.rgm}` : "Print anexado"}</b>
                <div className={classes.hint} style={{ overflowWrap: "anywhere" }}>{proof.readNote || [proof.reading && proof.reading.name, proof.reading && proof.reading.course].filter(Boolean).join(" · ") || proof.name}{" · clique para trocar"}</div>
              </>
            ) : <><b>Anexe o print da matrícula</b><div className={classes.hint}>Arraste, cole (Ctrl+V) ou clique. O RGM é preenchido sozinho e o print fica salvo para a gestão.</div></>}
          </div>
        </div>
        {!proof && <FormControlLabel style={{ marginTop: 4 }} control={<Checkbox color="primary" size="small" checked={noProof} onChange={(e) => setNoProof(e.target.checked)} />} label={<span className={classes.hint}>Não tenho o print agora (digito o RGM)</span>} />}
        <div className={classes.section}>Confira a ficha do aluno</div>
        <div className={classes.feeBox} style={{ marginTop: 0 }}>
          <div><b>{lead.name}</b></div>
          <div className={classes.hint}>WhatsApp: {(detail && detail.phone) || lead.phone || "não informado"} · CPF: {(detail && detail.cpf) || "não informado"}</div>
        </div>
        <TextField select fullWidth variant="outlined" margin="dense" label="Curso" value={v.courseId} onChange={(e) => setV({ ...v, courseId: e.target.value })}
          helperText={additional ? "O aluno continua com a primeira matrícula; esta conta como mais uma para você e para o polo." : "O curso em que o aluno se matriculou."}>
          {courses.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
        </TextField>
        <TextField fullWidth variant="outlined" margin="dense" label="RGM do aluno" required value={v.rgm} onChange={(e) => setV({ ...v, rgm: e.target.value })}
          error={!!v.rgm && !rgmOk} inputProps={{ maxLength: 40 }}
          helperText={v.rgm && !rgmOk ? "Use só letras, números e traços." : "O número de matrícula que a instituição gerou. Com ele o aluno já fica cadastrado no portal; o tutor só informa o e-mail de acesso."} />
        <div className={classes.section}>Quem vai ambientar o aluno</div>
        <TextField select fullWidth variant="outlined" margin="dense" label="Polo" value={v.poloId} onChange={(e) => setV({ ...v, poloId: e.target.value, tutorId: "auto" })}
          helperText={polos.length ? "O aluno vai para a fila de tutoria deste polo." : "Cadastre os polos em Polos e equipes."}>
          {polos.map((p) => (<MenuItem key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ""}</MenuItem>))}
        </TextField>
        <TextField select fullWidth variant="outlined" margin="dense" label="Tutor" value={v.tutorId} onChange={(e) => setV({ ...v, tutorId: e.target.value })} disabled={!v.poloId}
          helperText={isOther ? "Este tutor é de outro polo: ele passa a fazer parte da tutoria deste polo para acompanhar o aluno." : v.poloId && !tutors.some((t) => !t.outside) ? "Este polo ainda não tem tutor: escolha um de outro polo ou o aluno ficará aguardando na fila." : "Automático segue a regra de distribuição da fila (rodízio ou menos ocupado)."}>
          <MenuItem value="auto">Automático (rodízio da tutoria)</MenuItem>
          {tutors.some((t) => !t.outside) && <ListSubheader disableSticky style={{ pointerEvents: "none" }}>Tutores deste polo</ListSubheader>}
          {tutors.filter((t) => !t.outside).map((t) => (<MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>))}
          {others.length > 0 && <ListSubheader disableSticky style={{ pointerEvents: "none" }}>Outro tutor</ListSubheader>}
          {others.map((t) => (<MenuItem key={`o${t.id}`} value={t.id}>{t.name}</MenuItem>))}
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
        <div className={classes.hint}>{additional ? "Nenhuma mensagem é enviada ao aluno agora." : "O aluno recebe nesta conversa o número da tutoria, com o nome do tutor, e o pedido para mandar mensagem por lá e agendar a ambientação."} O tutor recebe a conversa com o texto de boas-vindas pronto. Daqui para frente o consultor não vê as mensagens do tutor, e o tutor não vê as suas; o contato com o aluno volta a você depois da ambientação.</div>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={confirm} disabled={busy || invalid}>
          {busy ? <CircularProgress size={18} /> : additional ? "Registrar nova matrícula" : "Confirmar e enviar para a tutoria"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EnrollDialog;
