import React, { useCallback, useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Button, Checkbox, LinearProgress, MenuItem, TextField, makeStyles } from "@material-ui/core";
import { RefreshCw } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import TopLoader from "../../components/TopLoader";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isManager as isManagerUser, accessLevel } from "../../utils/access";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { useCrmOptions, ago } from "./shared";
import EnrollDialog from "./EnrollDialog";
import { confirmDialog } from "../../components/ConfirmDialog";
import "../../styles/dash.css";
import { BoardHead, EmptyNote, GlowPanel, Person } from "../../components/peak";

// RECUPERAÇÃO: the leads that stopped answering or gave up, with the reason and the objection, to be tried again. The consultant sees their
// own; the management sees the ones of its polos (and can narrow to one consultant).
const useStyles = makeStyles((theme) => ({
  scroll: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: theme.spacing(1, 1, 3), ...theme.scrollbarStyles, "& .gv-tag": { border: "1px solid currentColor" } },
  progress: { flexBasis: "100%", display: "flex", alignItems: "center", gap: 10 },
  bar: { flex: 1, height: 8, borderRadius: 999 },
  why: { display: "block", marginTop: 2, fontSize: 13, color: "var(--text-1)", whiteSpace: "normal", overflowWrap: "anywhere" },
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
  status: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: theme.spacing(1, 1, 0), padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13, color: "var(--text-1)" },
  statusWarn: { borderColor: "#d97706", background: "rgba(217,119,6,.08)" },
  tabs: { display: "flex", flexWrap: "wrap", gap: 6, margin: theme.spacing(1, 1, 0) },
  detail: { display: "block", marginTop: 2, fontSize: 13, color: "var(--text-2)", whiteSpace: "normal", overflowWrap: "anywhere" },
  pick: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: theme.spacing(1, 1, 0), fontSize: 13, color: "var(--text-1)" },
  check: { padding: 4, alignSelf: "center" },
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
  const [tab, setTab] = useState("parados");
  const [enrolling, setEnrolling] = useState(null);
  // the audience of the recovery campaign: the leads ticked here (none ticked = everyone on the list on screen)
  const [picked, setPicked] = useState([]);
  useEffect(() => { setPicked([]); }, [tab, reason, objection, ownerId]);
  const togglePick = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  // "Ler tudo agora": the administrator reads every copied conversation waiting, past the daily limit
  const admin = accessLevel(user) === "admin";
  const [readingAll, setReadingAll] = useState(false);
  const readAll = async () => {
    const ok = await confirmDialog({
      title: "Ler todas as conversas agora?",
      message: `As ${(data && data.reading && data.reading.queued) || 0} conversas na fila serão lidas pela IA agora, além do limite do dia. Cada leitura tem um custo pequeno de IA; os limites de gasto continuam valendo. A leitura classifica cada conversa (lead, amigo, equipe) e coloca o lead na etapa certa do CRM.`,
      confirmText: "Ler tudo agora",
    });
    if (!ok) return;
    setReadingAll(true);
    try {
      await api.post("/crm/recovery/read-all");
      load();
      toast.success("Leitura iniciada. A lista se atualiza conforme as conversas são lidas.", { autoClose: 6000 });
    } catch (err) {
      toastError(err);
    } finally {
      setReadingAll(false);
    }
  };
  // "Ler de novo": the numbers by QR Code whose copied conversations can be read again (the person's own; every one for the management)
  const [numbers, setNumbers] = useState([]);
  const [rereadId, setRereadId] = useState("");
  const [rereading, setRereading] = useState(false);
  useEffect(() => { api.get("/crm/recovery/reread").then(({ data: d }) => setNumbers(Array.isArray(d) ? d : [])).catch(() => setNumbers([])); }, []);
  const reread = async () => {
    const target = numbers.find((n) => String(n.id) === String(rereadId || (numbers[0] && numbers[0].id)));
    if (!target) return;
    const ok = await confirmDialog({
      title: "Ler de novo as conversas?",
      message: `As conversas copiadas de "${target.name}" (${target.ownerName}) são lidas de novo, com as regras novas: colegas da equipe ficam de fora, as matrículas e os parados são refeitos. Leva alguns minutos.`,
      confirmText: "Ler de novo",
    });
    if (!ok) return;
    setRereading(true);
    try {
      const { data: r } = await api.post("/crm/recovery/reread", { whatsappId: target.id });
      toast.success(`${r.queued} ${r.queued === 1 ? "conversa voltou" : "conversas voltaram"} para a fila de leitura. Atualize esta tela em alguns minutos.`, { autoClose: 9000 });
      load();
    } catch (err) {
      toastError(err);
    } finally {
      setRereading(false);
    }
  };

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
  // while "Ler tudo agora" reads, the lists and the counts refresh by themselves
  const [polling, setPolling] = useState(false);
  useEffect(() => { setPolling(!!(data && data.reading && (data.reading.readingAll || data.reading.readingNow))); }, [data]);
  useEffect(() => {
    if (!polling && !readingAll) return undefined;
    const t = setInterval(() => { load(); }, 20000);
    return () => clearInterval(t);
  }, [polling, readingAll, load]);

  const act = async (id, action) => {
    setBusy(id);
    try {
      await api.post(`/leads/${id}/recovery`, { action });
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id), tabs: { ...d.tabs, [tab]: Math.max(0, ((d.tabs || {})[tab] || 1) - 1) } } : d));
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
      const label = (TABS.find((t) => t.key === tab) || TABS[0]).label;
      const name = `Recuperação ${new Date().toLocaleDateString("pt-BR")} · ${label}${reason ? ` · ${reason}` : ""}`.slice(0, 120);
      // exactly the audience chosen: the ticked leads, or everyone on the list on screen (tab, reason, objection, consultant)
      const leadIds = picked.length ? picked : items.map((l) => l.id);
      const { data: list } = await api.post("/contact-lists/from-leads", { audience: "recovery", name, leadIds });
      toast.success(`Lista "${list.name}" criada com ${list.imported} ${list.imported === 1 ? "pessoa" : "pessoas"}. Em Campanhas, crie a campanha com essa lista e defina a oferta.`, { autoClose: 9000 });
      history.push("/campaigns");
    } catch (err) {
      toastError(err);
    } finally {
      setListing(false);
    }
  };
  const all = (data && data.items) || [];
  const items = all.filter((l) => (l.tab || "desistiram") === tab);
  const counts = (data && data.tabs) || {};
  const TABS = [
    { key: "parados", label: "Parados (7+ dias)" },
    { key: "desistiram", label: "Desistiram" },
    { key: "confirmar", label: "Matrículas a confirmar" },
  ];
  const reading = data && data.reading;
  const STOP = {
    no_api_key: "parada: falta a chave da IA em um agente",
    disabled: "desligada pelo administrador",
    daily_limit: "parada até amanhã: chegou ao limite de leituras do dia (Configurações, Integrações)",
    budget: "parada até amanhã: chegou ao limite de gasto da leitura do dia",
  };
  const day = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : null);
  // the day and the hour of the last message, like the list of WhatsApp ("24/11/2026 às 14:32"), next to "há 3 dias"
  const when = (v) => { const d = new Date(v); return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
  // the number the conversation came through: "pelo WhatsApp João Vitor"
  const viaOf = (l) => (l.connectionName ? `pelo ${l.connectionChannel && l.connectionChannel !== "whatsapp" ? "" : /whatsapp/i.test(l.connectionName) ? "" : "WhatsApp "}${l.connectionName}` : null);
  return (
    <MainContainer>
      <BoardHead title="Recuperação" sub="Leads parados há 7 dias ou mais, os que desistiram e as matrículas que a leitura achou, com o que ficou pendente.">
        {manager && tab !== "confirmar" && <Button variant="contained" disableElevation disabled={listing || !items.length} onClick={toCampaign} style={{ background: "#fff", color: "#0b4279" }}>{listing ? "Criando a lista…" : picked.length ? `Criar campanha com ${picked.length} ${picked.length === 1 ? "selecionado" : "selecionados"}` : `Criar campanha com esta lista (${items.length})`}</Button>}
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
      {data && tab !== "confirmar" && data.reasons.length > 0 && (
        <div className={classes.reasons} role="group" aria-label="Motivo">
          <button type="button" className={`${classes.reason} ${!reason ? classes.reasonOn : ""}`} aria-pressed={!reason} onClick={() => setReason("")}>Todos {data.total}</button>
          {data.reasons.map((r) => (
            <button key={r.name} type="button" className={`${classes.reason} ${reason === r.name ? classes.reasonOn : ""}`} aria-pressed={reason === r.name} onClick={() => setReason(r.name)}>{r.name} {r.n}</button>
          ))}
        </div>
      )}
      {reading && (
        <div className={`${classes.status} ${reading.stopped ? classes.statusWarn : ""}`} role="status">
          <span>
            {reading.readingAll || reading.readingNow ? "Lendo as conversas copiadas" : "Leitura das conversas copiadas"}: {reading.done} de {reading.total || reading.done + reading.queued} lidas
            {reading.queued ? ` · faltam ${reading.queued}` : " · tudo lido"}{reading.failed ? ` · ${reading.failed} com falha` : ""}
            {reading.stopped ? ` · ${STOP[reading.stopped] || "parada"}` : ""}
            {reading.numbersWithoutOwner ? ` · ${reading.numbersWithoutOwner} ${reading.numbersWithoutOwner === 1 ? "número sem dono não é lido" : "números sem dono não são lidos"} (defina o dono em Conexões)` : ""}
          </span>
          {reading.stopped === "no_api_key" && <Button size="small" variant="outlined" onClick={() => history.push("/ai-agents")}>Configurar a IA</Button>}
          {admin && reading.queued > 0 && reading.stopped !== "no_api_key" && reading.stopped !== "disabled" && (
            <Button size="small" variant="contained" color="primary" disableElevation disabled={readingAll || reading.readingAll} onClick={readAll}>
              {reading.readingAll ? "Lendo as conversas…" : readingAll ? "Iniciando…" : "Ler tudo agora"}
            </Button>
          )}
          {(reading.total || 0) > 0 && (
            <div className={classes.progress}>
              <LinearProgress className={classes.bar} variant="determinate" value={Math.round(((reading.done + (reading.failed || 0)) / reading.total) * 100)} aria-label="Progresso da leitura das conversas" />
              <b>{Math.round(((reading.done + (reading.failed || 0)) / reading.total) * 100)}%</b>
            </div>
          )}
        </div>
      )}
      {numbers.length > 0 && (
        <div className={classes.status} style={{ gap: 8, flexWrap: "wrap" }}>
          <span>Leu errado ou faltou conversa? Leia de novo as conversas copiadas{numbers.length === 1 ? ` de ${numbers[0].name}` : ""}.</span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {numbers.length > 1 && (
              <TextField select size="small" variant="outlined" label="Número" value={rereadId || numbers[0].id} onChange={(e) => { const v = e.target.value; setRereadId(v); }} style={{ minWidth: 200 }}>
                {numbers.map((n) => (<MenuItem key={n.id} value={n.id}>{n.name} · {n.ownerName}</MenuItem>))}
              </TextField>
            )}
            <Button size="small" variant="outlined" startIcon={<RefreshCw size={15} />} disabled={rereading} onClick={reread} style={{ height: 40 }}>{rereading ? "Colocando na fila…" : "Ler de novo"}</Button>
          </span>
        </div>
      )}
      <div className={classes.tabs} role="tablist" aria-label="Lista">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`${classes.reason} ${tab === t.key ? classes.reasonOn : ""}`} onClick={() => setTab(t.key)}>
            {t.label} {counts[t.key] || 0}
          </button>
        ))}
      </div>
      <TopLoader active={loading} />
      {failed && (
        <div className={classes.error} role="alert">
          <span>Não foi possível carregar a Recuperação.</span>
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load}>Tentar de novo</Button>
        </div>
      )}
      {!failed && (
        <div className={`${classes.scroll} dash-scope gv-plain`}>
          {manager && tab !== "confirmar" && items.length > 0 && (
            <div className={classes.pick}>
              <Checkbox className={classes.check} size="small" color="primary" inputProps={{ "aria-label": "Selecionar todos desta lista" }}
                checked={picked.length > 0 && picked.length === items.length} indeterminate={picked.length > 0 && picked.length < items.length}
                onChange={() => setPicked(picked.length === items.length ? [] : items.map((l) => l.id))} />
              <span>{picked.length ? `${picked.length} de ${items.length} selecionados para a campanha` : "Marque quem vai receber a campanha (sem marcar, vai para a lista toda)"}</span>
              {picked.length > 0 && <Button size="small" onClick={() => setPicked([])}>Limpar</Button>}
            </div>
          )}
          <GlowPanel id="recovery" title={`${(TABS.find((t) => t.key === tab) || TABS[0]).label}${data ? ` (${items.length})` : ""}`} sub={tab === "confirmar" ? "A leitura achou sinais de matrícula. Confira o RGM, a data e o polo e confirme: nada é matriculado sozinho." : "Em ordem, da conversa mais antiga para a mais nova. O resumo vem da leitura da conversa."}>
            {!data && <div className="pk pk-skel" style={{ height: 120 }} aria-hidden="true" />}
            {data && items.length === 0 && <EmptyNote>{tab === "confirmar" ? "Nenhuma matrícula a confirmar." : `Nenhum lead nesta lista${reason || objection ? " com esse filtro" : ""}.`}</EmptyNote>}
            <div className="gv-rowlist">
              {items.map((l) => (
                <div key={l.id} className="gv-item">
                  {manager && tab !== "confirmar" && (
                    <Checkbox className={classes.check} size="small" color="primary" checked={picked.includes(l.id)} onChange={() => togglePick(l.id)} inputProps={{ "aria-label": `Selecionar ${l.name}` }} />
                  )}
                  <Person name={l.name} src={l.profilePicUrl} />
                  <div className="gv-item-main">
                    <b>
                      {l.name}
                      {l.tab !== "confirmar" && <span className="gv-tag" data-tone={l.stageType === "lost" ? "bad" : "warn"}>{l.reason || "Sem motivo"}</span>}
                      {l.tab !== "confirmar" && l.objectionLabel && <span className="gv-tag">Objeção: {l.objectionLabel}</span>}
                    </b>
                    <small>
                      {[l.courseName, manager ? l.ownerName : null, viaOf(l), l.lastContactAt ? `último contato ${when(l.lastContactAt)} (${ago(l.lastContactAt)})` : null].filter(Boolean).join(" · ")}
                      {l.reasonDetail && <span className={classes.why}>Motivo: {l.reasonDetail}</span>}
                      {l.summary && <span className={classes.summary}>{l.summary}</span>}
                      {l.tab === "confirmar" && (
                        <span className={classes.detail}>
                          {[`RGM: ${l.rgmSuggested || "não encontrado"}`, `Data: ${day(l.enrolledAtSuggested) || "não encontrada"}`, `Polo: ${l.poloName || "não encontrado"}`].join(" · ")}
                        </span>
                      )}
                      {l.tab !== "confirmar" && l.recoveryStage && <span className={classes.detail}>Parou em: {l.recoveryStage}</span>}
                      {l.tab !== "confirmar" && l.recoveryPending && <span className={classes.detail}>Pendente: {l.recoveryPending}</span>}
                      {l.serviceTip && <span className={classes.detail}>Melhorar no atendimento: {l.serviceTip}</span>}
                      {(l.improveLabels || []).length > 0 && <span className={classes.detail} style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>{l.improveLabels.map((t) => <span key={t} className="gv-tag" data-tone="warn">{t}</span>)}</span>}
                    </small>
                  </div>
                  <div className={classes.actions}>
                    <Button size="small" variant="outlined" onClick={() => history.push(`/crm?lead=${l.id}`)}>Abrir</Button>
                    {l.tab === "confirmar" ? (
                      <>
                        <Button size="small" variant="contained" color="primary" disableElevation disabled={busy === l.id} onClick={() => setEnrolling(l)}>Confirmar matrícula</Button>
                        <Button size="small" disabled={busy === l.id} onClick={() => act(l.id, "nao_matricula")}>Não é matrícula</Button>
                      </>
                    ) : (
                      <>
                        <Button size="small" variant="contained" color="primary" disableElevation disabled={busy === l.id} onClick={() => act(l.id, "voltar")}>{tab === "parados" ? "Retomar" : "Voltar ao funil"}</Button>
                        <Button size="small" disabled={busy === l.id} onClick={() => act(l.id, "descartar")}>Não recuperar</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlowPanel>
        </div>
      )}
      {enrolling && (
        <EnrollDialog open={!!enrolling} lead={enrolling} onClose={() => setEnrolling(null)} onDone={() => setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== enrolling.id), tabs: { ...d.tabs, confirmar: Math.max(0, ((d.tabs || {}).confirmar || 1) - 1) } } : d))} />
      )}
    </MainContainer>
  );
};

export default Recovery;
