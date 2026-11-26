import React, { useCallback, useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, makeStyles } from "@material-ui/core";
import { CheckCircle2, ClipboardCopy, Eye, FileText, Send, ShieldCheck, Trash2 } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager } from "../../utils/access";
import { copyDialog } from "../../components/ConfirmDialog";

const useStyles = makeStyles((theme) => ({
  card: { border: theme.border ? theme.border.divider : "1px solid rgba(127,127,127,.25)", borderRadius: 14, padding: 14, marginBottom: 18 },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  title: { fontWeight: 700, fontSize: 15 },
  hint: { color: theme.palette.text.secondary, fontSize: 13, lineHeight: 1.5 },
  bar: { height: 8, borderRadius: 8, margin: "10px 0 6px" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  btn: { textTransform: "none", borderRadius: 10, minHeight: 36 },
  data: { display: "grid", gridTemplateColumns: "minmax(110px, 38%) 1fr", gap: "6px 12px", marginTop: 12, fontSize: 13.5 },
  key: { color: theme.palette.text.secondary },
  value: { overflowWrap: "anywhere", fontWeight: 500 },
  files: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  file: { display: "inline-flex", alignItems: "center", gap: 6, textTransform: "none", borderRadius: 10 },
  img: { display: "block", maxWidth: "100%", maxHeight: "70vh", margin: "0 auto", borderRadius: 8 },
  // the full form in one view: grouped as the lead filled it; a tap on a value copies it (to type it in the institution's system)
  sheetSec: { marginBottom: 18 },
  sheetTitle: { fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: theme.palette.text.secondary, marginBottom: 6 },
  sheetRow: {
    display: "grid", gridTemplateColumns: "minmax(110px, 36%) 1fr auto", gap: 10, alignItems: "center", width: "100%", textAlign: "left", font: "inherit",
    padding: "9px 10px", border: 0, borderRadius: 10, background: "transparent", color: "inherit", cursor: "copy",
    "&:hover, &:focus-visible": { background: theme.palette.action.hover }, "&:hover $copyIcon, &:focus-visible $copyIcon": { opacity: 0.8 },
  },
  copyIcon: { opacity: 0.25, transition: "opacity .15s" },
}));

// the same groups the lead fills in (pages/EnrollmentForm)
const GROUPS = [
  ["Dados pessoais", ["nome", "nascimento", "cpf", "mae"]],
  ["Documento", ["rgNumero", "rgOrgao", "rgUf"]],
  ["Endereço", ["cep", "rua", "numero", "complemento", "bairro", "cidade", "uf"]],
  ["Contato", ["celular", "email"]],
];

const fmt = (key, v) => {
  const d = String(v || "").replace(/\D/g, "");
  if (!v) return "";
  if (key === "cpf" && d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (key === "cep" && d.length === 8) return d.replace(/(\d{5})(\d{3})/, "$1-$2");
  if (key === "celular") return d.length >= 12 ? `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, d.length - 4)}-${d.slice(-4)}` : v;
  if (key === "nascimento" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return v;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
};

// The enrollment form of the lead: how far the lead went, the personal link (WhatsApp or copy), what was typed and the pictures of the ID.
const EnrollmentFormCard = ({ lead, onChanged }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [form, setForm] = useState(undefined);
  const [busy, setBusy] = useState("");
  const [viewer, setViewer] = useState(null);
  const [erase, setErase] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);

  // a failed load is said as such (it used to look like "not sent yet")
  const load = useCallback(() => {
    api.get(`/leads/${lead.id}/enrollment-form`).then(({ data }) => { setForm(data); setFailed(false); }).catch(() => { setForm(null); setFailed(true); });
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy("send");
    try {
      const { data } = await api.post(`/leads/${lead.id}/enrollment-form/send`);
      setForm(data);
      toast.success("Link da ficha enviado pelo WhatsApp.");
      onChanged && onChanged();
    } catch (err) { toastError(err); }
    setBusy("");
  };
  const copy = async () => {
    setBusy("copy");
    try {
      const { data } = form ? { data: form } : await api.post(`/leads/${lead.id}/enrollment-form`);
      setForm(data);
      if (await copyText(data.link)) toast.success("Link da ficha copiado.");
      else copyDialog({ title: "Link da ficha de matrícula", message: "Copie o link e envie ao lead.", text: data.link });
    } catch (err) { toastError(err); }
    setBusy("");
  };
  const open = async (f) => {
    setBusy(`f${f.kind}`);
    try {
      const { data } = await api.get(`/leads/${lead.id}/enrollment-form/files/${f.kind}`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      if (f.mime === "application/pdf" || f.mime === "image/heic") {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        if (f.mime === "image/heic") a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else setViewer({ url, label: f.label });
    } catch (err) { toastError(err); }
    setBusy("");
  };
  const doErase = async () => {
    setBusy("erase");
    try {
      await api.delete(`/leads/${lead.id}/enrollment-form`);
      toast.success("Dados da ficha apagados.");
      setErase(false);
      load();
    } catch (err) { toastError(err); }
    setBusy("");
  };

  if (form === undefined) return <div className={classes.card} style={{ textAlign: "center" }}><CircularProgress size={20} /></div>;
  const filled = form && Object.keys(form.data || {}).length > 0;
  const status = failed && !form
    ? "Não foi possível carregar a ficha agora."
    : !form
    ? "Ainda não enviada ao lead."
    : form.submittedAt
    ? `Recebida em ${when(form.submittedAt)}.`
    : form.lastSavedAt
    ? `O lead está preenchendo. Última alteração em ${when(form.lastSavedAt)}.`
    : form.sentAt
    ? `Link enviado em ${when(form.sentAt)}. O lead ainda não abriu.`
    : "Link criado, ainda não enviado.";

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <span className={classes.title}>Ficha de matrícula</span>
        {form && <span style={{ fontWeight: 700, color: form.progress === 100 ? "#16a34a" : undefined }}>{form.progress}%</span>}
      </div>
      {form && <LinearProgress className={classes.bar} variant="determinate" value={form.progress} />}
      <div className={classes.hint}>
        {status}
        {form && !form.submittedAt && form.missing && form.missing.length > 0 && ` Falta: ${form.missing.slice(0, 4).join(", ")}${form.missing.length > 4 ? ` e mais ${form.missing.length - 4}` : ""}.`}
      </div>
      {failed && !form && <Button size="small" onClick={load}>Tentar de novo</Button>}
      {/* the CPF of the form already belongs to another lead: it was not copied to this one (the consultant checks if it is the same person) */}
      {form && form.submittedAt && form.data && form.data.cpf && lead.cpf && String(lead.cpf).replace(/\D/g, "") !== String(form.data.cpf).replace(/\D/g, "") && (
        <div className={classes.hint} style={{ color: "#b45309", marginTop: 6 }}>O CPF da ficha já está em outro lead e não foi copiado para este. Confira no histórico se é a mesma pessoa.</div>
      )}
      {form && form.submittedAt && form.data && form.data.cpf && Object.prototype.hasOwnProperty.call(lead, "cpf") && !lead.cpf && (
        <div className={classes.hint} style={{ color: "#b45309", marginTop: 6 }}>O CPF da ficha não foi copiado para o lead (já está em outro lead). Confira no histórico.</div>
      )}
      <div className={classes.actions}>
        <Button size="small" variant="contained" color="primary" className={classes.btn} startIcon={<Send size={15} />} disabled={!!busy} onClick={send}>
          {form && form.sentAt ? "Enviar de novo pelo WhatsApp" : "Enviar pelo WhatsApp"}
        </Button>
        <Button size="small" variant="outlined" className={classes.btn} startIcon={<ClipboardCopy size={15} />} disabled={!!busy} onClick={copy}>Copiar link</Button>
      </div>
      {filled && (
        <div className={classes.actions}>
          <Button size="small" variant="contained" color="primary" disableElevation className={classes.btn} startIcon={<Eye size={15} />} onClick={() => setSheet(true)}>
            Ver ficha{form.submittedAt ? "" : " (em preenchimento)"}
          </Button>
        </div>
      )}
      {form && form.files && form.files.length > 0 && (
        <div className={classes.files}>
          {form.files.map((f) => (
            <Button key={f.kind} size="small" variant="outlined" className={classes.file} disabled={!!busy} onClick={() => open(f)} startIcon={busy === `f${f.kind}` ? <CircularProgress size={14} /> : f.mime === "application/pdf" ? <FileText size={15} /> : <Eye size={15} />}>
              {f.label}
            </Button>
          ))}
        </div>
      )}
      {form && form.consentAt && (
        <div className={classes.hint} style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
          <ShieldCheck size={15} color="#16a34a" /> Autorização de uso dos dados (LGPD) dada em {when(form.consentAt)}.
          {form.submittedAt && <CheckCircle2 size={15} color="#16a34a" />}
        </div>
      )}
      {form && isManager(user) && (filled || (form.files || []).length > 0) && (
        <div className={classes.actions}>
          <Button size="small" className={classes.btn} startIcon={<Trash2 size={15} />} style={{ color: "#dc2626" }} disabled={!!busy} onClick={() => setErase(true)}>Apagar dados da ficha (pedido do titular)</Button>
        </div>
      )}
      <Dialog open={!!viewer} onClose={() => { if (viewer) URL.revokeObjectURL(viewer.url); setViewer(null); }} maxWidth="md" fullWidth>
        <DialogTitle>{viewer && viewer.label}</DialogTitle>
        <DialogContent>{viewer && <img src={viewer.url} alt={viewer.label} className={classes.img} />}</DialogContent>
        <DialogActions><Button onClick={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={sheet} onClose={() => setSheet(false)} maxWidth="sm" fullWidth scroll="paper" aria-labelledby="ficha-title">
        <DialogTitle id="ficha-title">Ficha de matrícula{lead.name ? ` · ${lead.name}` : ""}</DialogTitle>
        <DialogContent dividers>
          <div className={classes.hint} style={{ marginBottom: 12 }}>Toque num dado para copiar.{form && form.submittedAt ? ` Recebida em ${when(form.submittedAt)}.` : " O lead ainda está preenchendo."}</div>
          {form && (() => {
            const byKey = Object.fromEntries((form.fields || []).map((f) => [f.key, f]));
            const used = new Set(GROUPS.flatMap(([, keys]) => keys));
            const extra = (form.fields || []).map((f) => f.key).filter((k) => !used.has(k));
            return [...GROUPS, ["Outros", extra]].map(([title, keys]) => {
              const rows = keys.filter((k) => byKey[k] && form.data[k]);
              if (!rows.length) return null;
              return (
                <div key={title} className={classes.sheetSec}>
                  <div className={classes.sheetTitle}>{title}</div>
                  {rows.map((k) => {
                    const value = fmt(k, form.data[k]);
                    return (
                      <button key={k} type="button" className={classes.sheetRow} title="Copiar"
                        onClick={async () => { if (await copyText(String(value))) toast.success(`${byKey[k].label} copiado.`); }}>
                        <span className={classes.key}>{byKey[k].label}</span>
                        <span className={classes.value}>{value}</span>
                        <ClipboardCopy size={15} className={classes.copyIcon} />
                      </button>
                    );
                  })}
                </div>
              );
            });
          })()}
          {form && form.files && form.files.length > 0 && (
            <div className={classes.sheetSec}>
              <div className={classes.sheetTitle}>Documentos enviados</div>
              <div className={classes.files} style={{ marginTop: 0 }}>
                {form.files.map((f) => (
                  <Button key={f.kind} size="small" variant="outlined" className={classes.file} disabled={!!busy} onClick={() => open(f)} startIcon={busy === `f${f.kind}` ? <CircularProgress size={14} /> : f.mime === "application/pdf" ? <FileText size={15} /> : <Eye size={15} />}>
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={async () => {
            const text = (form ? GROUPS.flatMap(([, keys]) => keys) : []).filter((k) => form && form.data[k]).map((k) => `${((form.fields || []).find((f) => f.key === k) || { label: k }).label}: ${fmt(k, form.data[k])}`).join("\n");
            if (await copyText(text)) toast.success("Ficha copiada.");
          }}>Copiar tudo</Button>
          <Button variant="contained" color="primary" disableElevation onClick={() => setSheet(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={erase} onClose={() => setErase(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Apagar os dados da ficha?</DialogTitle>
        <DialogContent className={classes.hint}>Os dados digitados e as fotos do documento serão apagados de vez, como pede a LGPD quando o titular solicita. Isso não pode ser desfeito.</DialogContent>
        <DialogActions>
          <Button onClick={() => setErase(false)}>Cancelar</Button>
          <Button variant="contained" style={{ background: "#dc2626", color: "#fff" }} disabled={busy === "erase"} onClick={doErase}>Apagar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default EnrollmentFormCard;
