import React, { useCallback, useContext, useEffect, useState } from "react";
import { isManager } from "../../utils/access";
import { toast } from "react-toastify";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@material-ui/core";
import { Banknote, Check, CircleDollarSign, Download, Pencil, X } from "lucide-react";

import GlowCard from "../../components/GlowCard";
import NumberTicker from "../../components/NumberTicker";
import IconAction from "../../components/IconAction";
import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { BONUS_STATUS, brl, day, saveBlob, useStyles } from "./shared";

const FILTERS = [["", "Todas"], ["pending", "A aprovar"], ["approved", "Aprovadas"], ["paid", "Pagas"], ["cancelled", "Canceladas"]];

const BonusesTab = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isAdmin = isManager(user);
  const [status, setStatus] = useState("");
  const [data, setData] = useState({ rows: [], totals: { pending: 0, approved: 0, paid: 0 } });
  const [pay, setPay] = useState(null);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState(null);

  const load = useCallback(() => {
    api.get("/affiliate-bonuses", { params: { status: status || undefined } }).then(({ data: d }) => setData(d && Array.isArray(d.rows) && d.totals ? d : { rows: [], totals: { pending: 0, approved: 0, paid: 0 } })).catch(toastError);
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const socket = openSocket();
    socket.on("affiliateBonus", load);
    return () => socket.disconnect();
  }, [load]);

  const act = async (b, action, body = {}, ok) => {
    try { await api.put(`/affiliate-bonuses/${b.id}/${action}`, body); if (ok) toast.success(ok); load(); } catch (err) { toastError(err); }
  };

  const exportCsv = async () => {
    try {
      const r = await api.get("/affiliate-bonuses/export.csv", { params: { status: status || undefined }, responseType: "blob" });
      saveBlob(r.data, "bonificacoes.csv");
    } catch (err) { toastError(err); }
  };

  return (
    <div className={classes.page}>
      <div className={classes.kpis}>
        {[["A aprovar", data.totals.pending, "#b45309"], ["Aprovadas, a pagar", data.totals.approved, "#0b4279"], ["Já pagas", data.totals.paid, "#15803d"]].map(([l, v, c], i) => (
          <GlowCard key={l} className={classes.kpi} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={classes.kpiValue} style={{ color: c }}><NumberTicker value={v} format={brl} /></div>
            <div className={classes.kpiLabel}>{l}</div>
          </GlowCard>
        ))}
      </div>
      <div className={classes.toolbar}>
        {FILTERS.map(([v, l]) => (
          <Button key={v} size="small" variant={status === v ? "contained" : "outlined"} color={status === v ? "primary" : "default"} onClick={() => setStatus(v)}>{l}</Button>
        ))}
        <span className={classes.grow} />
        <Button variant="outlined" startIcon={<Download size={16} />} onClick={exportCsv}>Exportar para pagamento (CSV)</Button>
      </div>
      <div className={classes.body}>
        {data.rows.length === 0 && (
          <Paper variant="outlined" className={classes.empty}>
            <CircleDollarSign size={36} style={{ opacity: 0.6 }} />
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>Nenhuma bonificação {status ? "nessa situação" : "ainda"}</Typography>
            <Typography variant="body2">Cada matrícula de um indicado gera uma linha aqui, para o mantenedor pagar depois.</Typography>
          </Paper>
        )}
        <div className={classes.list}>
          {data.rows.map((b, i) => {
            const st = BONUS_STATUS[b.status] || BONUS_STATUS.pending;
            const a = b.affiliate || {};
            return (
              <GlowCard key={b.id} className={classes.row} style={{ cursor: "default", animationDelay: `${Math.min(i, 12) * 25}ms`, gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1.2fr) auto auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div className={classes.name}>{a.name}</div>
                  <div className={classes.sub}>{a.pixKey ? `Pix (${a.pixKeyType || "chave"}): ${a.pixKey}` : "Sem chave Pix cadastrada"}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className={classes.name}>{b.lead ? b.lead.name : ""}</div>
                  <div className={classes.sub}>{b.reason} · {day(b.createdAt)}{b.dueAt && b.status !== "paid" && b.status !== "cancelled" ? ` · pagar até ${day(b.dueAt)}` : ""}{b.paymentRef ? ` · ${b.paymentRef}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{brl(b.amount)}</div>
                  <span className={classes.chip} style={{ background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div className={classes.actions} style={{ marginLeft: 0 }}>
                  {isAdmin && ["pending", "approved"].includes(b.status) && <IconAction title="Corrigir o valor" onClick={() => setAmount({ b, v: b.amount })}><Pencil size={16} /></IconAction>}
                  {isAdmin && b.status === "pending" && <IconAction title="Aprovar" onClick={() => act(b, "approve", {}, "Bonificação aprovada.")}><Check size={17} /></IconAction>}
                  {isAdmin && ["pending", "approved"].includes(b.status) && <IconAction title="Marcar como paga" onClick={() => { setRef(""); setPay(b); }}><Banknote size={17} /></IconAction>}
                  {isAdmin && b.status !== "paid" && b.status !== "cancelled" && <IconAction title="Cancelar" onClick={() => act(b, "cancel", {}, "Bonificação cancelada.")}><X size={17} /></IconAction>}
                </div>
              </GlowCard>
            );
          })}
        </div>
      </div>

      <Dialog open={!!pay} onClose={() => setPay(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Marcar como paga</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" gutterBottom>{pay && `${brl(pay.amount)} para ${pay.affiliate ? pay.affiliate.name : ""}`}</Typography>
          <TextField label="Comprovante ou observação (opcional)" value={ref} onChange={(e) => setRef(e.target.value)} fullWidth margin="dense" variant="outlined" placeholder="Ex.: Pix de 14/11, ID E123..." autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPay(null)}>Cancelar</Button>
          <Button color="primary" variant="contained" onClick={() => { act(pay, "pay", { paymentRef: ref }, "Pagamento registrado."); setPay(null); }}>Confirmar pagamento</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!amount} onClose={() => setAmount(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Corrigir o valor</DialogTitle>
        <DialogContent dividers>
          <TextField label="Valor (R$)" type="number" value={amount ? amount.v : ""} onChange={(e) => setAmount({ ...amount, v: e.target.value })} fullWidth margin="dense" variant="outlined" autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAmount(null)}>Cancelar</Button>
          <Button color="primary" variant="contained" onClick={() => { act(amount.b, "amount", { amount: amount.v }, "Valor atualizado."); setAmount(null); }}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default BonusesTab;
