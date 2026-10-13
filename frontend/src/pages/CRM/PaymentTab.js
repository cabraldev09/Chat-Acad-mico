import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, TextField, Typography, makeStyles, CircularProgress, InputAdornment } from "@material-ui/core";
import { Copy, RefreshCw, Send, XCircle, BadgeCheck, Banknote, QrCode } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import openSocket from "../../services/socket-io";
import { formatCpf, isValidCpf, onlyDigits } from "./cpf";

const useStyles = makeStyles((theme) => ({
  card: { border: theme.border.divider, borderRadius: 14, padding: theme.spacing(2), background: theme.palette.cards.background, marginBottom: theme.spacing(1.5) },
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: theme.spacing(1.25) },
  title: { fontWeight: 600, fontSize: 15, flex: 1 },
  status: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600 },
  pending: { background: "rgba(217,119,6,.14)", color: "#b45309" },
  paid: { background: "rgba(22,163,74,.14)", color: "#15803d" },
  muted: { background: theme.palette.action.selected, color: theme.palette.text.secondary },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "#d97706", animation: "pulse-ring 1.8s ease-out infinite" },
  qrRow: { display: "flex", gap: theme.spacing(2), alignItems: "flex-start", flexWrap: "wrap" },
  qr: { width: 176, height: 176, borderRadius: 12, border: theme.border.divider, background: "#fff", padding: 6, flex: "none" },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, wordBreak: "break-all", maxHeight: 92, overflow: "auto",
    background: theme.palette.action.hover, borderRadius: 8, padding: theme.spacing(1), margin: theme.spacing(0.75, 0, 1),
  },
  amount: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" },
  hint: { color: theme.palette.text.secondary, fontSize: 13 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: theme.spacing(1.25) },
  paidIcon: { width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(22,163,74,.14)", color: "#16a34a", animation: "pop-in .4s var(--ease-spring)" },
  row: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: theme.border.divider, fontSize: 13.5 },
}));

const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusMap = { pending: ["Aguardando pagamento", "pending"], paid: ["Pago", "paid"], cancelled: ["Cancelada", "muted"], expired: ["Expirada", "muted"] };

const left = (iso) => {
  const m = differenceInMinutes(parseISO(iso), new Date());
  if (m <= 0) return "expirando";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d`;
};

const PaymentTab = ({ lead, onChanged }) => {
  const classes = useStyles();
  const history = useHistory();
  const [payments, setPayments] = useState(null);
  const [amount, setAmount] = useState("");
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/leads/${lead.id}/payments`);
      setPayments(data);
    } catch (err) { toastError(err); }
  }, [lead.id]);

  useEffect(() => { load(); }, [load, lead.stageId]);

  const open = (payments || []).find((p) => p.status === "pending");

  // while a charge is open: ask for news every 10 s (the server also polls) and listen for the push
  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(async () => {
      try { await api.post(`/payments/${open.id}/refresh`); load(); } catch (e) { /* offline Efí: next tick */ }
    }, 10000);
    const socket = openSocket();
    socket.on("payment", (d) => { if (d.leadId === lead.id) { load(); onChanged && onChanged(); } });
    return () => { clearInterval(t); socket.disconnect(); };
  }, [open && open.id, lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (name, fn) => async () => {
    setBusy(name); setError("");
    try { await fn(); } catch (err) {
      const code = err.response && err.response.data && err.response.data.error;
      if (code === "ERR_EFI_NOT_CONFIGURED" || code === "ERR_EFI_NO_CERT") setError(code); else toastError(err);
    } finally { setBusy(""); }
  };

  const saveCpf = run("cpf", async () => {
    await api.put(`/leads/${lead.id}`, { cpf: onlyDigits(cpf) });
    toast.success("CPF salvo");
    onChanged && onChanged();
  });
  const create = (force) => run("create", async () => {
    await api.post(`/leads/${lead.id}/payments`, { amount: amount || undefined, force: force || undefined });
    setAmount(""); await load(); onChanged && onChanged();
  });
  const refresh = run("refresh", async () => { await api.post(`/payments/${open.id}/refresh`); await load(); onChanged && onChanged(); toast.info("Status atualizado"); });
  const cancel = run("cancel", async () => { await api.post(`/payments/${open.id}/cancel`); await load(); onChanged && onChanged(); });
  const send = run("send", async () => { await api.post(`/payments/${open.id}/send`, {}); toast.success("PIX enviado ao candidato"); onChanged && onChanged(); });

  if (!payments) return <div style={{ textAlign: "center", padding: 32 }}><CircularProgress size={24} /></div>;

  const paid = payments.find((p) => p.status === "paid");
  const history_ = payments.filter((p) => p.id !== (open && open.id) && p.id !== (paid && paid.id));

  return (
    <div>
      {error && (
        <div className={classes.card} style={{ borderColor: "#d97706" }}>
          <Typography style={{ fontWeight: 600 }}>{error === "ERR_EFI_NO_CERT" ? "Certificado da Efí não enviado" : "Efí ainda não configurada"}</Typography>
          <Typography className={classes.hint}>Peça a um administrador para informar as credenciais e o certificado em Configurar CRM → Pagamentos (Efí).</Typography>
          <Button size="small" style={{ marginTop: 8 }} onClick={() => history.push("/crm/config")}>Abrir configurações</Button>
        </div>
      )}

      {paid && (
        <div className={classes.card} style={{ borderColor: "rgba(22,163,74,.5)", background: "rgba(22,163,74,.05)" }}>
          <div className={classes.head}>
            <span className={classes.paidIcon}><BadgeCheck size={24} /></span>
            <div style={{ flex: 1 }}>
              <div className={classes.title}>Taxa de matrícula paga</div>
              <div className={classes.hint}>{paid.paidAt ? format(parseISO(paid.paidAt), "dd/MM/yyyy 'às' HH:mm") : ""} · PIX Efí{paid.endToEndId ? ` · ${paid.endToEndId.slice(0, 14)}…` : ""}</div>
            </div>
            <div className={classes.amount} style={{ color: "#15803d" }}>{brl(paid.paidAmount || paid.amount)}</div>
          </div>
        </div>
      )}

      {!paid && !open && (
        <div className={classes.card}>
          <div className={classes.head}>
            <Banknote size={20} />
            <div className={classes.title}>Cobrar a taxa de matrícula</div>
          </div>
          {!lead.hasCpf ? (
            <>
              <Typography className={classes.hint} gutterBottom>Informe o CPF do candidato: a Efí exige o documento do pagador para emitir o PIX.</Typography>
              <div style={{ display: "flex", gap: 8 }}>
                <TextField size="small" variant="outlined" label="CPF" value={formatCpf(cpf)} onChange={(e) => setCpf(e.target.value)}
                  error={onlyDigits(cpf).length === 11 && !isValidCpf(cpf)} helperText={onlyDigits(cpf).length === 11 && !isValidCpf(cpf) ? "CPF inválido" : " "} style={{ flex: 1 }} />
                <Button variant="contained" color="primary" disabled={!isValidCpf(cpf) || busy === "cpf"} onClick={saveCpf} style={{ height: 40 }}>Salvar CPF</Button>
              </div>
            </>
          ) : (
            <>
              <Typography className={classes.hint} gutterBottom>
                O PIX é gerado na hora, com QR Code e copia e cola. Assim que o candidato pagar, o sistema detecta sozinho e avança o lead.
              </Typography>
              <TextField size="small" variant="outlined" label="Valor (opcional)" value={amount} onChange={(e) => setAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                helperText="Em branco: usa a taxa da última proposta (ou do modelo)." style={{ maxWidth: 260 }} />
              <div className={classes.actions}>
                <Button variant="contained" color="primary" startIcon={busy === "create" ? <CircularProgress size={16} /> : <QrCode size={16} />} disabled={busy === "create"} onClick={create(false)}>
                  Gerar PIX da matrícula
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {open && (
        <div className={classes.card} style={{ animation: "pop-in .3s var(--ease-out)" }}>
          <div className={classes.head}>
            <div className={classes.title}>Cobrança PIX da matrícula</div>
            <span className={`${classes.status} ${classes.pending}`}><span className={classes.dot} />Aguardando pagamento</span>
          </div>
          <div className={classes.qrRow}>
            {open.qrImage ? <img className={classes.qr} alt="QR Code do PIX" src={open.qrImage} /> : null}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className={classes.amount}>{brl(open.amount)}</div>
              <div className={classes.hint}>Expira em {open.expiresAt ? left(open.expiresAt) : "—"}</div>
              <div className={classes.code}>{open.pixCopiaECola}</div>
              <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={() => { navigator.clipboard.writeText(open.pixCopiaECola); toast.success("Código PIX copiado"); }}>Copiar código</Button>
            </div>
          </div>
          <div className={classes.actions}>
            <Button variant="contained" color="primary" startIcon={busy === "send" ? <CircularProgress size={16} /> : <Send size={16} />} disabled={busy === "send"} onClick={send}>Enviar ao candidato</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} disabled={busy === "refresh"} onClick={refresh}>Atualizar status</Button>
            <Button variant="outlined" startIcon={<XCircle size={16} />} disabled={busy === "cancel"} onClick={cancel} style={{ color: "#dc2626", borderColor: "rgba(220,38,38,.4)" }}>Cancelar cobrança</Button>
          </div>
        </div>
      )}

      {!open && paid && (
        <Button size="small" variant="outlined" onClick={create(true)} disabled={busy === "create"}>Gerar nova cobrança</Button>
      )}

      {history_.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className={classes.hint} style={{ fontWeight: 600, marginBottom: 4 }}>Histórico</div>
          {history_.map((p) => (
            <div key={p.id} className={classes.row}>
              <span style={{ flex: 1 }}>{brl(p.amount)} · {format(parseISO(p.createdAt), "dd/MM HH:mm")}</span>
              <span className={`${classes.status} ${classes[statusMap[p.status][1]]}`}>{statusMap[p.status][0]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentTab;
