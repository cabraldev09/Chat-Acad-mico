import React, { useCallback, useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Button, MenuItem, TextField, makeStyles } from "@material-ui/core";
import { RefreshCw } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import TopLoader from "../../components/TopLoader";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager as isManagerUser } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { useCrmOptions, ago } from "./shared";
import "../../styles/dash.css";
import { BoardHead, EmptyNote, GlowPanel, Person } from "../../components/peak";

// RECUPERAÇÃO: the leads that stopped answering or gave up, with the reason and the objection, to be tried again. The consultant sees their
// own; the management sees the ones of its polos (and can narrow to one consultant).
const useStyles = makeStyles((theme) => ({
  scroll: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: theme.spacing(1, 1, 3), ...theme.scrollbarStyles },
  filters: { display: "flex", flexWrap: "wrap", gap: theme.spacing(1), margin: theme.spacing(1, 1, 0), "& > *": { minWidth: 170 }, [theme.breakpoints.down("xs")]: { "& > *": { width: "100%" } } },
  reasons: { display: "flex", flexWrap: "wrap", gap: 6, margin: theme.spacing(1, 1, 1) },
  reason: {
    border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text-1)", borderRadius: 999, padding: "5px 12px", fontFamily: "inherit",
    fontSize: 13, cursor: "pointer", "&:focus-visible": { outline: "2px solid var(--c-leads)", outlineOffset: 2 },
  },
  reasonOn: { background: "var(--c-leads)", color: "#fff", borderColor: "transparent", fontWeight: 600 },
  summary: { display: "block", marginTop: 4, fontSize: 13, color: "var(--text-2)", whiteSpace: "normal" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  error: { display: "flex", alignItems: "center", gap: 12, padding: 16, margin: theme.spacing(1) },
}));

const Recovery = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const manager = isManagerUser(user);
  const { users } = useCrmOptions();
  const [ownerId, setOwnerId] = useState("");
  const [reason, setReason] = useState("");
  const [objection, setObjection] = useState("");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data: d } = await api.get("/crm/recovery", { params: { ...(ownerId ? { ownerId } : {}), ...(reason ? { reason } : {}), ...(objection ? { objection } : {}) } });
      setData(d);
    } catch (err) {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [ownerId, reason, objection]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setBusy(id);
    try {
      await api.post(`/leads/${id}/recovery`, { action });
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id), total: d.total - 1 } : d));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(0);
    }
  };

  // the management turns what is on screen (the reason and the objection chosen) into a list for a recovery campaign with an offer
  const [listing, setListing] = useState(false);
  const toCampaign = async () => {
    setListing(true);
    try {
      const name = `Recuperação ${new Date().toLocaleDateString("pt-BR")}${reason ? ` · ${reason}` : ""}`.slice(0, 120);
      const { data: list } = await api.post("/contact-lists/from-leads", { audience: "recovery", name, ...(reason ? { reason } : {}), ...(objection ? { objection } : {}), ...(ownerId ? { ownerId } : {}) });
      toast.success(`Lista "${list.name}" criada com ${list.imported} ${list.imported === 1 ? "pessoa" : "pessoas"}. Em Campanhas, crie a campanha com essa lista e defina a oferta.`, { autoClose: 9000 });
      history.push("/campaigns");
    } catch (err) {
      toastError(err);
    } finally {
      setListing(false);
    }
  };
  const items = (data && data.items) || [];
  return (
    <MainContainer>
      <BoardHead title="Recuperação" sub="Leads que pararam de responder ou desistiram, com o motivo. Retome a conversa ou devolva ao funil.">
        {manager && <Button variant="contained" disableElevation disabled={listing || !items.length} onClick={toCampaign} style={{ background: "#fff", color: "#0b4279" }}>{listing ? "Criando a lista…" : "Criar campanha de recuperação"}</Button>}
      </BoardHead>
      <div className={classes.filters}>
        {manager && (
          <TextField select size="small" label="Consultor" variant="outlined" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>{users.map((u) => (<MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>))}
          </TextField>
        )}
        <TextField select size="small" label="Objeção" variant="outlined" value={objection} onChange={(e) => setObjection(e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {((data && data.objections) || []).map((o) => (<MenuItem key={o.key} value={o.key}>{`${o.label} (${o.n})`}</MenuItem>))}
        </TextField>
      </div>
      {data && data.reasons.length > 0 && (
        <div className={classes.reasons} role="group" aria-label="Motivo">
          <button type="button" className={`${classes.reason} ${!reason ? classes.reasonOn : ""}`} aria-pressed={!reason} onClick={() => setReason("")}>Todos {data.total}</button>
          {data.reasons.map((r) => (
            <button key={r.name} type="button" className={`${classes.reason} ${reason === r.name ? classes.reasonOn : ""}`} aria-pressed={reason === r.name} onClick={() => setReason(r.name)}>{r.name} {r.n}</button>
          ))}
        </div>
      )}
      <TopLoader active={loading} />
      {failed && (
        <div className={classes.error} role="alert">
          <span>Não foi possível carregar a Recuperação.</span>
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load}>Tentar de novo</Button>
        </div>
      )}
      {!failed && (
        <div className={`${classes.scroll} dash-scope gv-plain`}>
          <GlowPanel id="recovery" title={`Para recuperar${data ? ` (${items.length})` : ""}`} sub="O resumo vem da leitura da conversa. Abra o lead para ver o histórico.">
            {!data && <div className="pk pk-skel" style={{ height: 120 }} aria-hidden="true" />}
            {data && items.length === 0 && <EmptyNote>Nenhum lead para recuperar{reason || objection ? " com esse filtro" : ""}.</EmptyNote>}
            <div className="gv-rowlist">
              {items.map((l) => (
                <div key={l.id} className="gv-item">
                  <Person name={l.name} />
                  <div className="gv-item-main">
                    <b>
                      {l.name}
                      <span className="gv-tag" data-tone={l.stageType === "lost" ? "bad" : "warn"}>{l.reason || "Sem motivo"}</span>
                      {l.objectionLabel && <span className="gv-tag">Objeção: {l.objectionLabel}</span>}
                    </b>
                    <small>
                      {[l.courseName, manager ? l.ownerName : null, l.lastContactAt ? `último contato ${ago(l.lastContactAt)}` : null].filter(Boolean).join(" · ")}
                      {l.summary && <span className={classes.summary}>{l.summary}</span>}
                      {l.nextAction && <span className={classes.summary}>Próximo passo: {l.nextAction}</span>}
                    </small>
                  </div>
                  <div className={classes.actions}>
                    <Button size="small" variant="outlined" onClick={() => history.push(`/crm?lead=${l.id}`)}>Abrir</Button>
                    <Button size="small" variant="contained" color="primary" disableElevation disabled={busy === l.id} onClick={() => act(l.id, "voltar")}>Voltar ao funil</Button>
                    <Button size="small" disabled={busy === l.id} onClick={() => act(l.id, "descartar")}>Não recuperar</Button>
                  </div>
                </div>
              ))}
            </div>
          </GlowPanel>
        </div>
      )}
    </MainContainer>
  );
};

export default Recovery;
