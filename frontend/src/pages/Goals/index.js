import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Autocomplete } from "@material-ui/lab";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography, makeStyles } from "@material-ui/core";
import { CalendarDays, Copy, Download, ImageDown, Plus, Repeat2, Save, Trash2 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import GoalsTabs from "../../components/GoalsTabs";
import NumberField from "../../components/NumberField";
import ShareFrame from "../../components/ShareFrame";
import BrandLogo from "../../components/BrandLogo";
import { copyPng, downloadPng, renderPng } from "../../utils/shareImage";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { fetchAllUsers } from "../Affiliates/shared";

const SHARE_WIDTH = 600;
const MONTHS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
// the month name of a date; empty when there is no (valid) date
const monthOf = (iso) => MONTHS[Number(String(iso || "").slice(5, 7)) - 1] || "";
const clean = (g) => ({ ...g, members: g.members.map((m) => ({ ...m })) });

// the message that goes to the team group
const headline = (g) => `✅ ${g.title ? g.title.toUpperCase() : `META DO MÊS DE ${monthOf(g.endsOn)}`} — ${dm(g.startsOn)} ATÉ ${dm(g.endsOn)}`;
const goalsText = (g) => `${headline(g)}\n\n${g.members.map((m) => `${m.label} —${m.target ? ` ${m.target}` : ""}`).join("\n")}`;
const progressText = (g) =>
  `${headline(g)}\n\n${g.members.map((m) => `${m.label} — ${m.target ? `${m.done}/${m.target}${m.reached ? " ✅" : ` (${m.missing === 1 ? "falta 1" : `faltam ${m.missing}`})`}` : m.done}`).join("\n")}\n\nTotal — ${g.total.done}${g.total.target ? `/${g.total.target} (faltam ${Math.max(0, g.total.target - g.total.done)})` : ""}`;

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(3) },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: theme.spacing(2) },
  tab: { border: theme.border.divider, background: "transparent", color: "inherit", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, "&:hover": { background: theme.palette.action.hover } },
  tabOn: { background: theme.palette.primary.main, color: "#fff", borderColor: theme.palette.primary.main, "&:hover": { background: theme.palette.primary.main } },
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: theme.spacing(2), alignItems: "start", [theme.breakpoints.down("md")]: { gridTemplateColumns: "1fr" } },
  card: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 14, padding: theme.spacing(2), marginBottom: theme.spacing(2) },
  head: { display: "flex", gap: theme.spacing(1.5), flexWrap: "wrap", alignItems: "center", marginBottom: theme.spacing(1.5) },
  hint: { fontSize: 12.5, color: theme.palette.text.secondary },
  bar: { height: 8, borderRadius: 999, background: theme.palette.action.selected, overflow: "hidden", position: "relative", minWidth: 80 },
  fill: { height: "100%", borderRadius: 999, background: "#0693E3", transition: "width .6s cubic-bezier(.2,.8,.2,1)" },
  row: { display: "grid", gridTemplateColumns: "minmax(150px, 1.4fr) minmax(130px, 1.2fr) 74px 74px minmax(110px, 1fr) 34px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: theme.border.divider, [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr 1fr", rowGap: 10 } },
  rowHead: { fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, [theme.breakpoints.down("sm")]: { display: "none" } },
  done: { fontVariantNumeric: "tabular-nums", fontWeight: 700 },
  pre: { whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, background: theme.palette.type === "dark" ? "#005c4b" : "#d9fdd3", color: theme.palette.type === "dark" ? "#e9edef" : "#111b21", padding: theme.spacing(1.5, 2), borderRadius: 12, margin: theme.spacing(1, 0) },
  seg: { display: "inline-flex", border: theme.border.divider, borderRadius: 10, overflow: "hidden", marginBottom: 6 },
  segBtn: { border: 0, background: "transparent", color: "inherit", padding: "5px 12px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  segOn: { background: theme.palette.primary.main, color: "#fff" },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2) },
}));

const Goals = () => {
  const classes = useStyles();
  const [goals, setGoals] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // the group always gets the progress ("feitas" and "faltam"), the message with only the targets is no longer offered
  const mode = "progress";
  const [newOpen, setNewOpen] = useState(false);
  const [period, setPeriod] = useState({ startsOn: "", endsOn: "" });
  const shareRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (keep) => {
    try {
      const { data } = await api.get("/goals");
      setGoals(data);
      const pick = data.find((g) => g.id === (keep || selected)) || data[0] || null;
      setSelected(pick ? pick.id : null);
      setDraft(pick ? clean(pick) : null);
      setDirty(false);
    } catch (e) { toastError(e); }
  }, [selected]);
  useEffect(() => { load(); fetchAllUsers().then(setUsers).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (g) => {
    if (dirty && !window.confirm("Há alterações não salvas. Descartar?")) return;
    setSelected(g.id); setDraft(clean(g)); setDirty(false);
  };
  const change = (fn) => { setDraft((d) => { const next = clean(d); fn(next); return next; }); setDirty(true); };
  const setMember = (i, patch) => change((d) => { d.members[i] = { ...d.members[i], ...patch }; });

  const save = async () => {
    setSaving(true);
    try {
      // the adjustment goes under both names: `manual` (what the list answers with) and `manualCount` (the column), so
      // it is kept whichever of the two the server reads
      const members = draft.members.map((m) => ({ ...m, manualCount: Number(m.manual) || 0 }));
      const { data } = await api.put(`/goals/${draft.id}`, { title: draft.title || "", startsOn: draft.startsOn, endsOn: draft.endsOn, members });
      toast.success("Metas salvas.");
      await load(data.id);
    } catch (e) { toastError(e); }
    setSaving(false);
  };
  const create = async () => {
    try {
      const { data } = await api.post("/goals", { ...period, members: [] });
      setNewOpen(false);
      await load(data.id);
    } catch (e) { toastError(e); }
  };
  const repeat = async () => {
    try { const { data } = await api.post(`/goals/${draft.id}/repeat`); toast.success("Período repetido com as mesmas pessoas e metas."); await load(data.id); } catch (e) { toastError(e); }
  };
  const remove = async () => {
    if (!window.confirm("Excluir este período de metas?")) return;
    try { await api.delete(`/goals/${draft.id}`); setSelected(null); await load(); } catch (e) { toastError(e); }
  };

  const view = useMemo(() => {
    if (!draft) return null;
    // live numbers while editing: auto counts come from the server, target and adjustment from the form
    const members = draft.members.map((m) => {
      const done = (m.auto || 0) + Number(m.manual || 0);
      const target = m.target === "" || m.target === null || m.target === undefined ? null : Number(m.target);
      return { ...m, manual: Number(m.manual || 0), done, target, pct: target ? Math.min(100, Math.round((done / target) * 100)) : null, missing: target === null ? null : Math.max(0, target - done), reached: !!target && done >= target };
    });
    const target = members.reduce((t, m) => t + (m.target || 0), 0);
    const done = members.reduce((t, m) => t + m.done, 0);
    return { ...draft, members, total: { target, done, pct: target ? Math.min(100, Math.round((done / target) * 100)) : null } };
  }, [draft]);

  const text = view ? (mode === "goals" ? goalsText(view) : progressText(view)) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("Mensagem copiada. É só colar no grupo."); } catch (e) { toast.error("Não foi possível copiar. Selecione o texto e copie."); }
  };
  const fileName = view ? `metas-${view.startsOn}-${view.endsOn}.png` : "metas.png";
  const withPng = (fn) => async () => {
    setBusy(true);
    try { await fn(await renderPng(shareRef.current, SHARE_WIDTH)); } catch (e) { toast.error("Não foi possível gerar a imagem. Tire um print da tela."); }
    setBusy(false);
  };
  const picture = withPng(async (url) => { downloadPng(url, fileName); });
  const copyImage = withPng(async (url) => {
    try { await copyPng(url); toast.success("Imagem copiada. Cole na conversa do WhatsApp."); } catch (e) { downloadPng(url, fileName); toast.info("Este navegador não copia imagem; a imagem foi baixada."); }
  });

  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <MainContainer>
      <MainHeader>
        <Title>Metas da equipe</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => { const t = new Date(); const y = t.getFullYear(); const m = t.getMonth(); setPeriod({ startsOn: `${m === 0 ? y - 1 : y}-${String(m === 0 ? 12 : m).padStart(2, "0")}-26`, endsOn: `${y}-${String(m + 1).padStart(2, "0")}-26` }); setNewOpen(true); }}>Nova meta</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <div className={classes.body}>
        <GoalsTabs current="team" />
        {goals && goals.length > 0 && (
          <div className={classes.tabs}>
            {goals.map((g) => (
              <button key={g.id} type="button" className={`${classes.tab} ${g.id === selected ? classes.tabOn : ""}`} onClick={() => choose(g)}>{dm(g.startsOn)} – {dm(g.endsOn)}{g.title ? ` · ${g.title}` : ""}</button>
            ))}
          </div>
        )}

        {goals && goals.length === 0 && (
          <div className={classes.empty}>Nenhum período de metas ainda. Use “Nova meta” para criar o primeiro, por exemplo de 26/09 a 26/10.</div>
        )}

        {view && (
          <div className={classes.layout}>
            <div>
              <div className={classes.card}>
                <div className={classes.head}>
                  <CalendarDays size={18} />
                  <TextField size="small" variant="outlined" type="date" label="Início" value={view.startsOn} onChange={(e) => change((d) => { d.startsOn = e.target.value; })} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" variant="outlined" type="date" label="Prazo" value={view.endsOn} onChange={(e) => change((d) => { d.endsOn = e.target.value; })} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" variant="outlined" label="Título (opcional)" placeholder="Ex.: Meta de outubro" value={view.title || ""} onChange={(e) => change((d) => { d.title = e.target.value; })} style={{ minWidth: 200 }} />
                  <span style={{ flex: 1 }} />
                  <Tooltip title="Repetir para o próximo período"><IconButton size="small" onClick={repeat}><Repeat2 size={18} /></IconButton></Tooltip>
                  <Tooltip title="Excluir período"><IconButton size="small" onClick={remove}><Trash2 size={18} /></IconButton></Tooltip>
                </div>

                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div className={classes.hint}>Matrículas do período</div>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{view.total.done}{view.total.target ? <span className={classes.hint} style={{ fontSize: 16 }}> / {view.total.target}</span> : null}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className={classes.hint}>{view.daysLeft > 0 ? `Faltam ${view.daysLeft} dia${view.daysLeft === 1 ? "" : "s"} · ${view.elapsedPct}% do prazo` : "Prazo encerrado"}</div>
                    <div className={classes.bar} style={{ marginTop: 6 }}><div className={classes.fill} style={{ width: `${view.total.pct || 0}%` }} /></div>
                  </div>
                </div>

                <div className={`${classes.row} ${classes.rowHead}`}><span>Consultor</span><span>Contam matrículas de</span><span>Meta</span><span>Ajuste</span><span>Andamento</span><span /></div>
                {view.members.map((m, i) => (
                  <div className={classes.row} key={m.id || `n${i}`}>
                    <Autocomplete freeSolo size="small" options={userOptions} getOptionLabel={(o) => (typeof o === "string" ? o : o.name)} inputValue={m.label}
                      onInputChange={(_, v, reason) => { if (reason === "input") setMember(i, { label: v }); }}
                      onChange={(_, v) => { if (v && typeof v !== "string") setMember(i, { label: v.name.split(" ")[0], userIds: [v.id] }); }}
                      renderInput={(p) => <TextField {...p} variant="outlined" placeholder="Nome na mensagem" />} />
                    <Autocomplete multiple size="small" options={userOptions} getOptionLabel={(o) => o.name} value={userOptions.filter((u) => (m.userIds || []).includes(u.id))}
                      onChange={(_, v) => setMember(i, { userIds: v.map((u) => u.id) })} getOptionSelected={(o, v) => o.id === v.id}
                      renderInput={(p) => <TextField {...p} variant="outlined" placeholder={m.userIds && m.userIds.length ? "" : "Só ajuste manual"} />} />
                    <NumberField size="small" variant="outlined" nullable value={m.target} onChange={(v) => setMember(i, { target: v })} />
                    <NumberField size="small" variant="outlined" value={m.manual} onChange={(v) => setMember(i, { manual: v })} />
                    <div>
                      <div className={classes.done}>{m.done}{m.target ? ` / ${m.target}` : ""} {m.reached ? "✅" : ""}</div>
                      <div className={classes.bar}><div className={classes.fill} style={{ width: `${m.pct || 0}%`, background: m.reached ? "#16a34a" : "#0693E3" }} /></div>
                      <div className={classes.hint}>{m.auto ? `${m.auto} do CRM` : "sem matrícula no CRM"}{m.missing ? ` · falta ${m.missing}${m.pace ? ` (${String(m.pace).replace(".", ",")}/dia)` : ""}` : ""}</div>
                    </div>
                    <IconButton size="small" aria-label="Remover linha" onClick={() => change((d) => { d.members.splice(i, 1); })}><Trash2 size={16} /></IconButton>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={() => change((d) => { d.members.push({ label: "", userIds: [], target: null, manual: 0, auto: 0 }); })}>Adicionar consultor</Button>
                  <span style={{ flex: 1 }} />
                  <Button variant="contained" color="primary" startIcon={<Save size={16} />} onClick={save} disabled={!dirty || saving}>Salvar alterações</Button>
                </div>
                <div className={classes.hint} style={{ marginTop: 8 }}>A matrícula do CRM entra sozinha quando o lead é marcado como matriculado e tem o consultor como responsável. Use “Ajuste” para quem não tem login ou para somar à mão.</div>
              </div>
            </div>

            <div>
              <div className={classes.card}>
                <Typography style={{ fontWeight: 700 }}>Mensagem para o grupo</Typography>
                <pre className={classes.pre}>{text}</pre>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="contained" color="primary" startIcon={<Copy size={16} />} onClick={copy}>Copiar</Button>
                  <Button variant="outlined" startIcon={<ImageDown size={16} />} onClick={picture} disabled={busy}>Baixar imagem</Button>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button variant="outlined" startIcon={<Copy size={16} />} onClick={copyImage} disabled={busy}>Copiar imagem</Button>
                </div>
              </div>

              <div className={classes.card}>
                <Typography style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Download size={15} /> Cartão para print</Typography>
                <ShareFrame width={SHARE_WIDTH} innerRef={shareRef}>
                  <div style={{ background: "#fff", color: "#0b1a2e", fontFamily: "Geist, system-ui, sans-serif" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px 16px" }}>
                      <BrandLogo height={42} tone="color" />
                      <div style={{ fontSize: 14, color: "#4b5d73" }}>{dm(view.startsOn)} até {dm(view.endsOn)}</div>
                    </div>
                    <div style={{ background: "linear-gradient(135deg, #0B4279, #0693E3)", color: "#fff", padding: "18px 28px 20px" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{view.title || `Metas de ${monthOf(view.endsOn).toLowerCase()}`}</div>
                      {view.total.target ? (
                        <>
                          <div style={{ display: "flex", gap: 26, marginTop: 12 }}>
                            {[["Feitas", view.total.done], ["Meta", view.total.target], ["Faltam", Math.max(0, view.total.target - view.total.done)]].map(([l, v]) => (
                              <div key={l}><div style={{ fontSize: 13, opacity: 0.85 }}>{l}</div><div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{v}</div></div>
                            ))}
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.25)", marginTop: 14, overflow: "hidden" }}><div style={{ width: `${view.total.pct || 0}%`, height: "100%", background: "#FEF84C", borderRadius: 999 }} /></div>
                        </>
                      ) : null}
                    </div>
                    {view.members.map((m, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 10, alignItems: "center", padding: "13px 28px", borderBottom: "1px solid #e6ecf4" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 18 }}>{m.label || "—"}</div>
                          <div style={{ height: 10, borderRadius: 999, background: "#e6ecf4", marginTop: 8, overflow: "hidden" }}><div style={{ width: `${m.pct || 0}%`, height: "100%", borderRadius: 999, background: m.reached ? "#16a34a" : "#0693E3" }} /></div>
                          {mode === "progress" && m.target ? <div style={{ fontSize: 13, color: m.reached ? "#15803d" : "#4b5d73", marginTop: 5 }}>{m.reached ? "Meta batida" : `${m.done} ${m.done === 1 ? "feita" : "feitas"} · ${m.missing === 1 ? "falta 1" : `faltam ${m.missing}`}`}</div> : null}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 700, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{mode === "goals" ? (m.target || "") : `${m.done}${m.target ? `/${m.target}` : ""}`}</div>
                      </div>
                    ))}
                    <div style={{ padding: "14px 28px", background: "#f4f8fc", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
                      <span>Total</span><span>{view.total.done}{view.total.target ? ` / ${view.total.target}` : ""}</span>
                    </div>
                  </div>
                </ShareFrame>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Novo período de metas</DialogTitle>
        <DialogContent>
          <TextField fullWidth variant="outlined" margin="dense" type="date" label="Início" value={period.startsOn} onChange={(e) => setPeriod({ ...period, startsOn: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField fullWidth variant="outlined" margin="dense" type="date" label="Prazo" value={period.endsOn} onChange={(e) => setPeriod({ ...period, endsOn: e.target.value })} InputLabelProps={{ shrink: true }} />
          <div className={classes.hint}>Depois de criar, adicione os consultores e as metas. Para repetir o mês anterior com as mesmas pessoas, use o botão de repetir no período.</div>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setNewOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={create} disabled={!period.startsOn || !period.endsOn}>Criar período</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default Goals;
