import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { ArrowDownLeft, Banknote, CheckCircle2, Clock3, Download, Pencil, ShieldCheck, Wallet, XCircle } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { saveBlob } from "../Affiliates/shared";

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayOf = (iso) => String(iso).slice(0, 10);

// the four situations of a commission, in bank-statement words
const KIND = {
  received: { label: "Recebida", color: "#15803d", bg: "rgba(22,163,74,.14)", Icon: CheckCircle2, sign: "+" },
  owed: { label: "A receber", color: "#b45309", bg: "rgba(245,158,11,.18)", Icon: Banknote, sign: "" },
  waiting: { label: "Prevista", color: "#475569", bg: "rgba(100,116,139,.16)", Icon: Clock3, sign: "" },
  cancelled: { label: "Cancelada", color: "#94a3b8", bg: "rgba(148,163,184,.18)", Icon: XCircle, sign: "" },
};
const TABS = [["", "Tudo"], ["received", "Recebidas"], ["owed", "A receber"], ["waiting", "Previstas"]];
const RANGES = [["month", "Este mês"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["all", "Todo o período"]];

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
    wrap: { maxWidth: 920, margin: "0 auto" },
    walletBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: theme.spacing(1.25, 2), border: `1px solid ${line}`, borderRadius: 14, background: theme.palette.cards.background, marginBottom: theme.spacing(2) },
    walletOk: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 14 },
    mask: { fontVariantNumeric: "tabular-nums", letterSpacing: ".06em", opacity: 0.75 },
    walletForm: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginTop: 12 },
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 12.5, color: theme.palette.text.secondary },
    // the "account" header: one balance, the rest around it
    balance: { background: "linear-gradient(135deg, #0B4279, #0a5ba8)", color: "#fff", borderRadius: 20, padding: theme.spacing(3), marginBottom: theme.spacing(2), display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: theme.spacing(2), alignItems: "end", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr 1fr" } },
    balanceMain: { gridColumn: "auto", [theme.breakpoints.down("sm")]: { gridColumn: "1 / -1" } },
    balanceLabel: { fontSize: 13, opacity: 0.85, fontWeight: 500 },
    balanceValue: { fontSize: 38, fontWeight: 700, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginTop: 4 },
    smallValue: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", marginTop: 4 },
    toolbar: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
    tabs: { display: "inline-flex", padding: 3, borderRadius: 12, border: `1px solid ${line}`, background: theme.palette.cards.background },
    tab: { border: 0, background: "transparent", color: theme.palette.text.secondary, padding: "6px 14px", borderRadius: 9, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
    tabOn: { background: theme.palette.primary.main, color: "#fff" },
    statement: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, overflow: "hidden" },
    dayHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 18px", background: dark ? "rgba(255,255,255,.04)" : "#f4f7fb", borderTop: `1px solid ${line}`, fontSize: 12.5, fontWeight: 700, color: theme.palette.text.secondary, "&:first-child": { borderTop: 0 } },
    entry: { display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 14, alignItems: "center", padding: "12px 18px", borderTop: `1px solid ${line}` },
    icon: { width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center" },
    title: { fontWeight: 600, fontSize: 14.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    link: { border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", fontWeight: 600, padding: 0, textAlign: "left", "&:hover": { textDecoration: "underline" } },
    amount: { textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" },
    meta: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 1 },
    empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2) },
  };
});

const Commissions = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  // the coordination reads and settles everyone's commissions, like the administration
  const isAdmin = user.profile === "admin" || user.role === "coordenacao";
  const [data, setData] = useState(null);
  const [bucket, setBucket] = useState("");
  const [range, setRange] = useState("month");
  const [search, setSearch] = useState("");
  const [consultant, setConsultant] = useState("");
  const [offset, setOffset] = useState(0);
  const [wallet, setWallet] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(null);
  const [note, setNote] = useState("");

  const dates = useMemo(() => {
    if (range === "all") return {};
    const to = new Date();
    const from = range === "month" ? new Date(to.getFullYear(), to.getMonth(), 1) : new Date(to.getTime() - Number(range) * 86400000);
    const iso = (d) => format(d, "yyyy-MM-dd");
    return { from: iso(from), to: iso(to) };
  }, [range]);
  const params = useMemo(() => ({ bucket: bucket || undefined, search: search || undefined, userId: consultant || undefined, ...dates }), [bucket, search, consultant, dates]);

  const load = useCallback(() => {
    api.get("/commissions", { params: { ...params, offset, limit: 50 } }).then(({ data: d }) => setData(d)).catch(toastError);
  }, [params, offset]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);
  useEffect(() => { setOffset(0); }, [params]);

  // the balance always counts the whole period, whichever tab is open
  const [totals, setTotals] = useState(null);
  useEffect(() => {
    api.get("/commissions", { params: { userId: consultant || undefined, ...dates, limit: 10 } }).then(({ data: d }) => setTotals(d.summary)).catch(() => undefined);
  }, [consultant, dates, data]);

  const saveWallet = async () => {
    setSaving(true);
    try {
      await api.put("/me/efi", { payeeCode: wallet.trim() });
      toast.success("Wallet ID salvo. As próximas comissões vão direto para a sua carteira.");
      setWallet("");
      setEditing(false);
      load();
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  const removeWallet = async () => {
    try { await api.delete("/me/efi"); toast.success("Wallet ID removido."); setEditing(false); load(); } catch (e) { toastError(e); }
  };
  const settle = async (undo) => {
    try {
      await api.put(`/commissions/${settling.id}/settle`, { note, undo });
      toast.success(undo ? "Repasse desfeito." : "Comissão marcada como repassada.");
      setSettling(null);
      setNote("");
      load();
    } catch (e) { toastError(e); }
  };
  const exportCsv = async () => {
    try {
      const { data: blob } = await api.get("/commissions/export.csv", { params, responseType: "blob" });
      saveBlob(blob, "extrato-comissoes.csv");
    } catch (e) { toastError(e); }
  };

  const all = data && data.scope === "all";
  const informed = data && data.wallet.informed;
  const s = totals;

  // lançamentos agrupados por dia: pagos pela data do pagamento, o resto pela data de criação
  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.rows.forEach((r) => {
      const when = r.bucket === "received" || r.bucket === "owed" ? r.paidAt || r.createdAt : r.createdAt;
      const key = dayOf(when);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...r, when });
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  return (
    <MainContainer>
      <MainHeader>
        <Title>Comissões</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" color="primary" startIcon={<Download size={16} />} onClick={exportCsv} disabled={!data}>Exportar extrato</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.body}>
        <div className={classes.wrap}>
          {!isAdmin && data && (
            informed && !editing ? (
              <div className={classes.walletBar}>
                <span className={classes.walletOk}><ShieldCheck size={18} color="#15803d" /> Carteira Efí conectada</span>
                <span className={classes.mask}>{data.wallet.masked}</span>
                <span className={classes.hint} style={{ flex: 1, minWidth: 200 }}>As comissões caem direto na sua conta quando o aluno paga.</span>
                <Button size="small" startIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>Alterar</Button>
              </div>
            ) : (
              <div className={classes.card}>
                <Typography style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Wallet size={18} /> {informed ? "Alterar a carteira da Efí" : "Conecte a sua carteira da Efí"}</Typography>
                <div className={classes.hint} style={{ marginTop: 4, maxWidth: 640 }}>
                  {informed
                    ? "Informe o novo Wallet ID. As próximas comissões vão para a nova conta."
                    : "Informe o Wallet ID da sua conta Efí para receber a comissão direto na sua conta, no momento em que o aluno pagar a taxa. Sem ele, a comissão fica com a empresa e é repassada a você à mão (aparece como “A receber”)."}
                </div>
                <div className={classes.walletForm}>
                  <TextField size="small" variant="outlined" label="Wallet ID da Efí" value={wallet} onChange={(e) => setWallet(e.target.value)} style={{ minWidth: 320 }}
                    helperText="De 6 a 64 letras e números, sem espaços" inputProps={{ autoComplete: "off", spellCheck: false }} />
                  <Button variant="contained" color="primary" onClick={saveWallet} disabled={saving || wallet.trim().length < 6}>Salvar</Button>
                  {informed && <Button variant="outlined" onClick={() => { setEditing(false); setWallet(""); }}>Cancelar</Button>}
                  {informed && <Button color="secondary" onClick={removeWallet}>Remover carteira</Button>}
                </div>
              </div>
            )
          )}

          <div className={classes.balance}>
            <div className={classes.balanceMain}>
              <div className={classes.balanceLabel}>{all ? "Comissões a repassar" : "Saldo a receber"}</div>
              <div className={classes.balanceValue}>{s ? brl(s.owed.total) : "–"}</div>
              <div className={classes.balanceLabel} style={{ marginTop: 6 }}>{s ? `${s.owed.count} matrícula${s.owed.count === 1 ? "" : "s"} paga${s.owed.count === 1 ? "" : "s"} que ficaram com a empresa` : ""}</div>
            </div>
            <div>
              <div className={classes.balanceLabel}>Já recebido</div>
              <div className={classes.smallValue}>{s ? brl(s.received.total) : "–"}</div>
              <div className={classes.balanceLabel}>{s ? `${s.received.count} lançamento${s.received.count === 1 ? "" : "s"}` : ""}</div>
            </div>
            <div>
              <div className={classes.balanceLabel}>Previsto</div>
              <div className={classes.smallValue}>{s ? brl(s.waiting.total) : "–"}</div>
              <div className={classes.balanceLabel}>aguardando o aluno pagar</div>
            </div>
          </div>

          <div className={classes.toolbar}>
            <div className={classes.tabs} role="tablist">
              {TABS.map(([k, l]) => <button key={k || "all"} type="button" role="tab" aria-selected={bucket === k} className={`${classes.tab} ${bucket === k ? classes.tabOn : ""}`} onClick={() => setBucket(k)}>{l}</button>)}
            </div>
            <TextField select size="small" variant="outlined" value={range} onChange={(e) => setRange(e.target.value)} style={{ minWidth: 170 }}>
              {RANGES.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            </TextField>
            {all && (
              <TextField select size="small" variant="outlined" label="Consultor" value={consultant} onChange={(e) => setConsultant(e.target.value)} style={{ minWidth: 180 }}>
                <MenuItem value="">Todos</MenuItem>
                {(data.consultants || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            )}
            <TextField size="small" variant="outlined" placeholder="Buscar aluno ou consultor" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220, flex: 1 }} />
          </div>

          <div className={classes.statement}>
            {data && data.rows.length > 0 ? groups.map(([key, rows]) => {
              const dayTotal = rows.filter((r) => r.bucket === "received").reduce((t, r) => t + r.commission, 0);
              return (
                <div key={key}>
                  <div className={classes.dayHead}>
                    <span>{format(parseISO(`${key}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase())}</span>
                    {dayTotal > 0 && <span style={{ color: "#15803d" }}>+ {brl(dayTotal)}</span>}
                  </div>
                  {rows.map((r) => {
                    const k = KIND[r.bucket];
                    return (
                      <div className={classes.entry} key={r.id}>
                        <span className={classes.icon} style={{ background: k.bg, color: k.color }}>{r.bucket === "received" ? <ArrowDownLeft size={18} /> : <k.Icon size={18} />}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className={classes.title}>
                            <button type="button" className={classes.link} onClick={() => history.push(`/crm?lead=${r.leadId}`)}>{r.lead}</button>
                            {all && <span style={{ fontWeight: 400, opacity: 0.7 }}> · {r.consultant}</span>}
                          </div>
                          <div className={classes.meta}>
                            <span style={{ color: k.color, fontWeight: 600 }}>{k.label}</span>
                            {" · "}
                            {r.bucket === "received" ? (r.viaWallet ? "direto na carteira da Efí" : `repassada${r.settledAt ? ` em ${format(parseISO(r.settledAt), "dd/MM")}` : ""}${r.note ? ` · ${r.note}` : ""}`)
                              : r.bucket === "owed" ? "ficou com a empresa: sem Wallet ID no pagamento"
                              : r.bucket === "waiting" ? "o aluno ainda não pagou a taxa" : "cobrança cancelada"}
                            {" · "}{r.pct}% de {brl(r.paidAmount ?? r.amount)}
                            {r.bucket === "received" || r.bucket === "owed" ? ` · pago às ${format(parseISO(r.when), "HH:mm")}` : ""}
                          </div>
                        </div>
                        <div>
                          <div className={classes.amount} style={{ color: k.color }}>{k.sign}{k.sign ? " " : ""}{brl(r.commission)}</div>
                          {all && r.bucket === "owed" && <div style={{ textAlign: "right", marginTop: 4 }}><Button size="small" variant="outlined" color="primary" onClick={() => { setSettling(r); setNote(""); }}>Marcar repassada</Button></div>}
                          {all && r.bucket === "received" && !r.viaWallet && <div style={{ textAlign: "right" }}><Button size="small" onClick={() => setSettling(r)}>Desfazer</Button></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }) : (
              <div className={classes.empty}>{data ? "Nenhum lançamento neste período. As comissões aparecem quando uma taxa de matrícula é cobrada no CRM." : "Carregando..."}</div>
            )}
          </div>

          {data && data.count > 50 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 12 }}>
              <Button size="small" variant="outlined" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Anteriores</Button>
              <span className={classes.hint}>{offset + 1}–{Math.min(offset + 50, data.count)} de {data.count}</span>
              <Button size="small" variant="outlined" disabled={offset + 50 >= data.count} onClick={() => setOffset(offset + 50)}>Próximos</Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!settling} onClose={() => setSettling(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{settling && settling.bucket === "received" ? "Desfazer repasse" : "Marcar como repassada"}</DialogTitle>
        <DialogContent>
          {settling && (
            <Typography variant="body2" gutterBottom>
              {settling.bucket === "received"
                ? `A comissão de ${brl(settling.commission)} de ${settling.consultant} volta para “A receber”.`
                : `Confirme que você já pagou ${brl(settling.commission)} a ${settling.consultant} pela matrícula de ${settling.lead}.`}
            </Typography>
          )}
          {settling && settling.bucket !== "received" && (
            <TextField fullWidth variant="outlined" margin="dense" label="Observação (opcional)" placeholder="Ex.: Pix de 14/10" value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setSettling(null)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={() => settle(settling.bucket === "received")}>{settling && settling.bucket === "received" ? "Desfazer" : "Confirmar repasse"}</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default Commissions;
