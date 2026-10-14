import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography, makeStyles,
} from "@material-ui/core";
import { CheckCircle2, Clock3, Download, Wallet, XCircle, Banknote } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { saveBlob } from "../Affiliates/shared";

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d) => (d ? format(parseISO(d), "dd/MM/yyyy") : "—");

const BUCKETS = {
  received: { label: "Recebida", color: "#15803d", bg: "rgba(22,163,74,.14)", Icon: CheckCircle2 },
  owed: { label: "A receber", color: "#b45309", bg: "rgba(245,158,11,.18)", Icon: Banknote },
  waiting: { label: "Aguardando pagamento do aluno", color: "#0b4279", bg: "rgba(6,147,227,.14)", Icon: Clock3 },
  cancelled: { label: "Cancelada", color: "#64748b", bg: "rgba(100,116,139,.16)", Icon: XCircle },
};

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(3) },
  card: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 14, padding: theme.spacing(2), marginBottom: theme.spacing(2) },
  walletRow: { display: "flex", gap: theme.spacing(1.5), alignItems: "flex-start", flexWrap: "wrap", marginTop: theme.spacing(1.25) },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 4, maxWidth: 640 },
  band: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: theme.spacing(1.5), marginBottom: theme.spacing(2), [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" } },
  stat: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 14, padding: theme.spacing(1.75, 2), cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "inherit", "&:hover": { borderColor: theme.palette.primary.main } },
  statOn: { borderColor: theme.palette.primary.main, boxShadow: `0 0 0 1px ${theme.palette.primary.main}` },
  statLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.palette.text.secondary, fontWeight: 600 },
  statValue: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 6, fontVariantNumeric: "tabular-nums" },
  filters: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14, "& th": { textAlign: "left", fontSize: 12, color: theme.palette.text.secondary, fontWeight: 600, padding: "8px 10px", borderBottom: theme.border.divider, whiteSpace: "nowrap" }, "& td": { padding: "10px", borderBottom: theme.border.divider, verticalAlign: "top" }, "& .num": { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" },
  link: { border: 0, background: "transparent", color: theme.palette.primary.main, cursor: "pointer", fontFamily: "inherit", fontSize: 14, padding: 0, textAlign: "left", "&:hover": { textDecoration: "underline" } },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(5, 2) },
  scroll: { overflowX: "auto" },
}));

const Commissions = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const isAdmin = user.profile === "admin";
  const [data, setData] = useState(null);
  const [bucket, setBucket] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [consultant, setConsultant] = useState("");
  const [offset, setOffset] = useState(0);
  const [wallet, setWallet] = useState("");
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(null);
  const [note, setNote] = useState("");

  const params = useMemo(() => ({ bucket: bucket || undefined, search: search || undefined, from: from || undefined, to: to || undefined, userId: consultant || undefined }), [bucket, search, from, to, consultant]);

  const load = useCallback(() => {
    api.get("/commissions", { params: { ...params, offset, limit: 50 } }).then(({ data: d }) => setData(d)).catch(toastError);
  }, [params, offset]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);
  useEffect(() => { setOffset(0); }, [params]);

  const saveWallet = async () => {
    setSaving(true);
    try {
      await api.put("/me/efi", { payeeCode: wallet.trim() });
      toast.success("Wallet ID salvo. As próximas comissões vão direto para a sua carteira.");
      setWallet("");
      load();
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  const removeWallet = async () => {
    try { await api.delete("/me/efi"); toast.success("Wallet ID removido."); load(); } catch (e) { toastError(e); }
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
      saveBlob(blob, "comissoes.csv");
    } catch (e) { toastError(e); }
  };

  const all = data && data.scope === "all";
  const s = data ? data.summary : null;

  return (
    <MainContainer>
      <MainHeader>
        <Title>Comissões</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" color="primary" startIcon={<Download size={16} />} onClick={exportCsv} disabled={!data}>Exportar CSV</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.body}>
        {!isAdmin && (
          <div className={classes.card}>
            <Typography style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Wallet size={18} /> Sua carteira da Efí</Typography>
            <div className={classes.hint}>
              {data && data.wallet.informed
                ? `Wallet ID informado (${data.wallet.masked}). A comissão de cada matrícula paga cai direto na sua conta, no momento do pagamento do aluno.`
                : "Informe o Wallet ID da sua conta Efí para receber a comissão direto na sua conta, no momento em que o aluno pagar a taxa. Sem ele, a comissão fica com a empresa e é repassada a você à mão (aparece como “A receber”)."}
            </div>
            <div className={classes.walletRow}>
              <TextField size="small" variant="outlined" label={data && data.wallet.informed ? "Novo Wallet ID" : "Wallet ID da Efí"} value={wallet} onChange={(e) => setWallet(e.target.value)} style={{ minWidth: 320 }}
                helperText="De 6 a 64 letras e números, sem espaços" inputProps={{ autoComplete: "off", spellCheck: false }} />
              <Button variant="contained" color="primary" onClick={saveWallet} disabled={saving || wallet.trim().length < 6}>Salvar</Button>
              {data && data.wallet.informed && <Button variant="outlined" color="secondary" onClick={removeWallet}>Remover</Button>}
            </div>
          </div>
        )}

        <div className={classes.band}>
          {["received", "owed", "waiting"].map((k) => {
            const b = BUCKETS[k];
            return (
              <button key={k} type="button" className={`${classes.stat} ${bucket === k ? classes.statOn : ""}`} onClick={() => setBucket(bucket === k ? "" : k)}>
                <div className={classes.statLabel}><b.Icon size={15} color={b.color} /> {k === "received" ? "Recebidas" : k === "owed" ? "A receber" : "Aguardando o aluno pagar"}</div>
                <div className={classes.statValue} style={{ color: b.color }}>{s ? brl(s[k].total) : "–"}</div>
                <div className={classes.hint} style={{ marginTop: 2 }}>{s ? `${s[k].count} matrícula${s[k].count === 1 ? "" : "s"}` : ""}</div>
              </button>
            );
          })}
        </div>

        <div className={classes.filters}>
          <TextField size="small" variant="outlined" placeholder="Buscar aluno ou consultor" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
          {all && (
            <TextField select size="small" variant="outlined" label="Consultor" value={consultant} onChange={(e) => setConsultant(e.target.value)} style={{ minWidth: 200 }}>
              <MenuItem value="">Todos</MenuItem>
              {(data.consultants || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          )}
          <TextField size="small" variant="outlined" type="date" label="De" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" variant="outlined" type="date" label="Até" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          {(bucket || search || from || to || consultant) && <Button size="small" onClick={() => { setBucket(""); setSearch(""); setFrom(""); setTo(""); setConsultant(""); }}>Limpar filtros</Button>}
        </div>

        <div className={`${classes.card} ${classes.scroll}`} style={{ padding: 0 }}>
          {data && data.rows.length > 0 ? (
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Aluno</th>{all && <th>Consultor</th>}<th>Taxa paga</th><th>%</th><th>Comissão</th><th>Situação</th><th>Criada</th><th>Paga</th><th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const b = BUCKETS[r.bucket];
                  return (
                    <tr key={r.id}>
                      <td><button type="button" className={classes.link} onClick={() => history.push(`/crm?lead=${r.leadId}`)}>{r.lead}</button></td>
                      {all && <td>{r.consultant}</td>}
                      <td className="num">{brl(r.paidAmount ?? r.amount)}</td>
                      <td className="num">{r.pct}%</td>
                      <td className="num" style={{ fontWeight: 700 }}>{brl(r.commission)}</td>
                      <td>
                        <span className={classes.chip} style={{ background: b.bg, color: b.color }}><b.Icon size={13} />{b.label}</span>
                        {r.bucket === "received" && <div className={classes.hint} style={{ marginTop: 2 }}>{r.viaWallet ? "Direto na carteira da Efí" : `Repassada em ${day(r.settledAt)}${r.note ? ` · ${r.note}` : ""}`}</div>}
                        {r.bucket === "owed" && <div className={classes.hint} style={{ marginTop: 2 }}>Ficou com a empresa: sem Wallet ID no pagamento</div>}
                      </td>
                      <td className="num">{day(r.createdAt)}</td>
                      <td className="num">{day(r.paidAt)}</td>
                      <td>
                        {all && r.bucket === "owed" && <Button size="small" variant="outlined" color="primary" onClick={() => { setSettling(r); setNote(""); }}>Marcar repassada</Button>}
                        {all && r.bucket === "received" && !r.viaWallet && <Button size="small" onClick={() => { setSettling(r); }}>Desfazer</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className={classes.empty}>{data ? "Nenhuma comissão neste filtro. Elas aparecem quando uma taxa de matrícula é cobrada no CRM." : "Carregando..."}</div>
          )}
        </div>

        {data && data.count > 50 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 12 }}>
            <Button size="small" variant="outlined" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Anteriores</Button>
            <span className={classes.hint}>{offset + 1}–{Math.min(offset + 50, data.count)} de {data.count}</span>
            <Button size="small" variant="outlined" disabled={offset + 50 >= data.count} onClick={() => setOffset(offset + 50)}>Próximas</Button>
          </div>
        )}
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
