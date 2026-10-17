import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, TextField, Typography, makeStyles, CircularProgress, InputAdornment } from "@material-ui/core";
import { Copy, RefreshCw, Send, XCircle, BadgeCheck, Banknote, QrCode, Fingerprint, History, ExternalLink, CalendarClock } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import openSocket from "../../services/socket-io";

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
  banner: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: theme.spacing(1.5) },
  cpfRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: theme.spacing(1), flexWrap: "wrap" },
  upd: { display: "flex", gap: 10, padding: "6px 0", animation: "page-in .3s var(--ease-out) both" },
  updDot: { width: 9, height: 9, borderRadius: "50%", background: theme.palette.divider, marginTop: 6, flex: "none" },
  updPaid: { background: "#16a34a", boxShadow: "0 0 0 4px rgba(22,163,74,.18)" },
  row: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: theme.border.divider, fontSize: 13.5 },
}));

const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusMap = { pending: ["Aguardando pagamento", "pending"], paid: ["Pago", "paid"], cancelled: ["Cancelada", "muted"], expired: ["Expirada", "muted"], scheduled: ["Agendada", "muted"] };
// a status this screen does not know (a new one on the server) must not take the screen down
const statusOf = (status) => statusMap[status] || [String(status || "—"), "muted"];

const left = (iso) => {
  const m = differenceInMinutes(parseISO(iso), new Date());
  if (m <= 0) return "expirando";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d`;
};

const PaymentTab = ({ lead, acts = [], onChanged, onEditSummary }) => {
  const classes = useStyles();
  const history = useHistory();
  const [payments, setPayments] = useState(null);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
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
  // a charge far from its due date is only issued some days before it
  const scheduled = (payments || []).find((p) => p.status === "scheduled");

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

  const create = (force) => run("create", async () => {
    await api.post(`/leads/${lead.id}/payments`, { amount: amount || undefined, dueDate: dueDate || undefined, force: force || undefined });
    setAmount(""); setDueDate(""); await load(); onChanged && onChanged();
  });
  const refresh = run("refresh", async () => { await api.post(`/payments/${open.id}/refresh`); await load(); onChanged && onChanged(); toast.info("Status atualizado"); });
  const cancel = run("cancel", async () => { await api.post(`/payments/${open.id}/cancel`); await load(); onChanged && onChanged(); });
  const send = run("send", async () => { await api.post(`/payments/${open.id}/send`, {}); toast.success("Boleto com Pix enviado ao candidato"); onChanged && onChanged(); });

  if (!payments) return <div style={{ textAlign: "center", padding: 32 }}><CircularProgress size={24} /></div>;

  const paid = payments.find((p) => p.status === "paid");
  const history_ = payments.filter((p) => p.id !== (open && open.id) && p.id !== (paid && paid.id));

  const state = paid ? "paid" : open ? "pending" : "none";
  const banner = {
    paid: ["Taxa de matrícula paga", "paid"],
    pending: ["Aguardando o pagamento do boleto ou do Pix", "pending"],
    none: [payments.length ? "Nenhuma cobrança em aberto" : "Nenhuma cobrança gerada", "muted"],
  }[state];
  const updates = acts.filter((a) => /matr[ií]cula|PIX|cobran[cç]a/i.test(a.body || ""));

  return (
    <div>
      <div className={classes.banner}>
        <span className={`${classes.status} ${classes[banner[1]]}`}>{state === "pending" && <span className={classes.dot} />}{banner[0]}</span>
        <span className={classes.hint}>{state === "pending" ? "Atualiza sozinho assim que a Efí confirmar" : state === "paid" ? "Confirmado pela Efí" : "Gere o boleto com Pix abaixo"}</span>
      </div>

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
              <div className={classes.hint}>{paid.paidAt ? format(parseISO(paid.paidAt), "dd/MM/yyyy 'às' HH:mm") : ""} · {paid.method === "bolix" ? "Boleto com Pix" : "Pix"} Efí{paid.endToEndId ? ` · ${paid.endToEndId.slice(0, 14)}…` : ""}</div>
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
          <div className={classes.cpfRow}>
            <Fingerprint size={16} />
            {lead.hasCpf ? (
              <span>CPF do cadastro: <b>{lead.cpfMasked}</b></span>
            ) : (
              <span style={{ color: "#b45309" }}>CPF não cadastrado</span>
            )}
            <Button size="small" onClick={onEditSummary}>{lead.hasCpf ? "Alterar no cadastro" : "Cadastrar no resumo"}</Button>
          </div>
          {!lead.hasCpf ? (
            <Typography className={classes.hint}>
              A cobrança usa o CPF informado no cadastro do candidato (aba Resumo): a Efí exige o documento do pagador para emitir a cobrança.
            </Typography>
          ) : (
            <>
              <Typography className={classes.hint} gutterBottom>
                A cobrança é um boleto com QR Code de Pix: o candidato paga como preferir, até o vencimento. Assim que pagar, o sistema detecta sozinho e avança o lead.
              </Typography>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <TextField size="small" variant="outlined" label="Valor (opcional)" value={amount} onChange={(e) => setAmount(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                  helperText="Em branco: usa a taxa da última proposta (ou do modelo)." style={{ maxWidth: 260 }} />
                <TextField size="small" variant="outlined" type="date" label="Vencimento (opcional)" InputLabelProps={{ shrink: true }} value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  helperText="Em branco: o prazo padrão da empresa." style={{ width: 210 }} />
              </div>
              <div className={classes.actions}>
                <Button variant="contained" color="primary" startIcon={busy === "create" ? <CircularProgress size={16} /> : <QrCode size={16} />} disabled={busy === "create"} onClick={create(false)}>
                  Gerar boleto com Pix
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!open && scheduled && (
        <div className={classes.card}>
          <div className={classes.head}>
            <CalendarClock size={20} />
            <div className={classes.title}>Cobrança agendada</div>
            <span className={`${classes.status} ${classes.muted}`}>Agendada</span>
          </div>
          <div className={classes.amount}>{brl(scheduled.amount)}</div>
          <div className={classes.hint}>
            Vence em {scheduled.dueDate ? format(parseISO(scheduled.dueDate), "dd/MM/yyyy") : "—"}. O boleto com Pix é gerado em {scheduled.generateAt ? format(parseISO(scheduled.generateAt), "dd/MM/yyyy") : "—"} e o consultor recebe uma tarefa para enviá-lo.
          </div>
        </div>
      )}

      {open && (
        <div className={classes.card} style={{ animation: "pop-in .3s var(--ease-out)" }}>
          <div className={classes.head}>
            <div className={classes.title}>{open.method === "bolix" ? "Boleto com Pix da matrícula" : "Cobrança Pix da matrícula"}</div>
            <span className={`${classes.status} ${classes.pending}`}><span className={classes.dot} />Aguardando pagamento</span>
          </div>
          <div className={classes.qrRow}>
            {open.qrImage ? <img className={classes.qr} alt="QR Code do Pix" src={open.qrImage} /> : null}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className={classes.amount}>{brl(open.amount)}</div>
              <div className={classes.hint}>
                {open.method === "bolix" && open.dueDate ? `Vence em ${format(parseISO(open.dueDate), "dd/MM/yyyy")}` : `Expira em ${open.expiresAt ? left(open.expiresAt) : "—"}`}
              </div>
              <div className={classes.code}>{open.pixCopiaECola}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={() => { navigator.clipboard.writeText(open.pixCopiaECola); toast.success("Código Pix copiado"); }}>Copiar Pix</Button>
                {open.barcode && <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={() => { navigator.clipboard.writeText(open.barcode); toast.success("Linha digitável copiada"); }}>Copiar linha digitável</Button>}
                {(open.pdfLink || open.billetLink) && <Button size="small" variant="outlined" startIcon={<ExternalLink size={14} />} href={open.pdfLink || open.billetLink} target="_blank" rel="noopener noreferrer">Abrir o boleto</Button>}
              </div>
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

      {updates.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className={classes.hint} style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><History size={14} /> Atualizações do pagamento</div>
          {updates.map((a) => (
            <div key={a.id} className={classes.upd}>
              <span className={`${classes.updDot} ${/paga:/i.test(a.body) ? classes.updPaid : ""}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{a.body}</div>
                <div className={classes.hint} style={{ fontSize: 12 }}>{format(parseISO(a.createdAt), "dd/MM HH:mm")}{a.user ? ` · ${a.user.name}` : " · automático"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {history_.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className={classes.hint} style={{ fontWeight: 600, marginBottom: 4 }}>Histórico</div>
          {history_.map((p) => (
            <div key={p.id} className={classes.row}>
              <span style={{ flex: 1 }}>{brl(p.amount)} · {format(parseISO(p.createdAt), "dd/MM HH:mm")}</span>
              <span className={`${classes.status} ${classes[statusOf(p.status)[1]]}`}>{statusOf(p.status)[0]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentTab;
