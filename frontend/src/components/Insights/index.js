import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNowStrict, isToday, isYesterday, format } from "date-fns";
import { ptBR } from "date-fns/locale";

import api from "../../services/api";
import { initialsOf, colorOf } from "../../utils/avatar";
import { GlowPanel, PriorityList, EmptyNote } from "../peak";

// Two blocks shared by the Painel do CRM and Estatísticas: the priorities of now (each one a line that opens where to act) and who is
// using the system, in the boxes of the panels (components/peak).

const ROLE = { admin: "Administração", coordenacao: "Coordenação", consultor: "Consultor", tutor: "Tutor", academico: "Acadêmico", relacionamento: "Relacionamento" };

const useStyles = makeStyles((theme) => ({
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card, 14px)", padding: theme.spacing(2, 2.25), minWidth: 0, boxShadow: "var(--shadow-card)" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  title: { fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8, margin: 0 },
  sub: { fontSize: 12.5, color: "var(--text-2)" },
  item: {
    display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit",
    padding: "10px 8px", margin: "0 -8px", borderRadius: 10, cursor: "pointer", transition: "background-color .15s ease",
    "&:hover": { background: "var(--surface-2)" }, "&:focus-visible": { outline: "2px solid var(--c-brand, #0B4279)", outlineOffset: 1 },
    "& + &": { borderTop: "1px solid var(--line)", borderRadius: 0 },
  },
  icon: { width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", flex: "none" },
  itemTitle: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 },
  itemDetail: { fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.4 },
  skel: { height: 44, borderRadius: 10, background: "var(--surface-2)", marginTop: 8, animation: "$pulse 1.2s ease-in-out infinite", "@media (prefers-reduced-motion: reduce)": { animation: "none" } },
  "@keyframes pulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.55 } },
  btn: { border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", borderRadius: 8, padding: "5px 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 550, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  link: { border: 0, background: "transparent", color: "var(--c-leads, #0693E3)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 },
  // the people online, in an overlapping stack, then everybody with the last access
  stack: { display: "flex", alignItems: "center", marginBottom: 6, minHeight: 34 },
  stackAv: { marginLeft: -8, "&:first-child": { marginLeft: 0 } },
  av: { position: "relative", width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontSize: 12, fontWeight: 700, flex: "none", boxShadow: "0 0 0 2px var(--surface)" },
  dot: { position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--surface)" },
  person: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", minWidth: 0, "&:first-of-type": { borderTop: 0 } },
  name: { fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  seen: { fontSize: 12.5, color: "var(--text-2)", whiteSpace: "nowrap", marginLeft: "auto", fontVariantNumeric: "tabular-nums" },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 650, color: "#15803d", background: "rgba(22,163,74,.12)", borderRadius: 999, padding: "3px 10px" },
}));

const useLoad = (url, enabled = true, every = 0) => {
  const [state, setState] = useState({ data: null, failed: false, loading: true });
  const load = useCallback(() => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true }));
    api.get(url).then(({ data }) => setState({ data, failed: false, loading: false })).catch(() => setState((s) => ({ ...s, failed: true, loading: false })));
  }, [url, enabled]);
  useEffect(() => {
    load();
    if (!every) return undefined;
    // only while the tab is visible
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, every);
    return () => clearInterval(t);
  }, [load, every]);
  return { ...state, reload: load };
};

const Failed = ({ onRetry, text }) => {
  const c = useStyles();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span className={c.sub} style={{ flex: 1, minWidth: 0 }}>{text}</span>
      <button type="button" className={c.btn} onClick={onRetry}><RefreshCw size={13} />Tentar de novo</button>
    </div>
  );
};

// What deserves attention now and what the numbers are saying, one sentence each; a click opens where to act
export const InsightsCard = ({ limit = 6, style, title = "Prioridades de agora" }) => {
  const history = useHistory();
  const { data, failed, loading, reload } = useLoad("/analytics/insights", true, 120000);
  // the most urgent first: what is late, then what asks for attention, then the good news and the notes
  const order = { danger: 0, warn: 1, info: 2, good: 3 };
  const items = [...((data && data.items) || [])].sort((x, y) => (order[x.tone] ?? 2) - (order[y.tone] ?? 2)).slice(0, limit);
  return (
    <GlowPanel id="priorities" style={style} title={title} sub="O que pede ação, do mais urgente ao menos. Cada linha abre a tela onde se resolve."
      loading={loading && !data} error={failed && !data} onRetry={reload}>
      {!!data && !items.length && <EmptyNote>Tudo em dia. Nenhum ponto pedindo atenção agora.</EmptyNote>}
      <PriorityList items={items.map((it) => ({ key: it.key, tone: it.tone, title: it.title, detail: it.detail, onClick: it.link ? () => history.push(it.link) : undefined }))} />
    </GlowPanel>
  );
};

export const lastSeenText = (iso, online) => {
  if (online) return "agora";
  if (!iso) return "nunca acessou";
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 3600000) return formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: true });
  if (isToday(d)) return `hoje, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `ontem, ${format(d, "HH:mm")}`;
  return format(d, "dd/MM, HH:mm");
};

const Avatar = ({ name, online, className }) => {
  const c = useStyles();
  return (
    <span className={`${c.av} ${className || ""}`} style={{ background: colorOf(name) }} title={name}>
      {initialsOf(name)}
      <span className={c.dot} style={{ background: online ? "#16a34a" : "#94a3b8" }} />
    </span>
  );
};

// Who is using the system now and the last access of everybody (management only: the server refuses the others)
export const TeamOnline = ({ limit = 8, style }) => {
  const c = useStyles();
  const [all, setAll] = useState(false);
  const { data, failed, loading, reload } = useLoad("/analytics/online", true, 60000);
  const users = (data && data.users) || [];
  const online = users.filter((u) => u.online);
  const shown = all ? users : users.slice(0, limit);
  return (
    <GlowPanel id="team-online" style={style} title="Equipe" sub="Online: usou o sistema nos últimos 5 minutos."
      action={data ? <span className={c.pill}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a" }} />{online.length} online agora</span> : null}>
      {loading && !data && [0, 1, 2].map((i) => <div key={i} className={c.skel} />)}
      {failed && !data && <Failed onRetry={reload} text="Não foi possível carregar a equipe agora." />}
      {online.length > 1 && (
        <div className={c.stack} aria-hidden="true">
          {online.slice(0, 10).map((u) => <Avatar key={u.id} name={u.name} online className={c.stackAv} />)}
          {online.length > 10 && <span className={c.sub} style={{ marginLeft: 8 }}>+{online.length - 10}</span>}
        </div>
      )}
      {data && !users.length && <div className={c.sub}>Nenhuma pessoa cadastrada.</div>}
      {shown.map((u) => (
        <div key={u.id} className={c.person}>
          <Avatar name={u.name} online={u.online} />
          <div style={{ minWidth: 0 }}>
            <div className={c.name}>{u.name}</div>
            <div className={c.sub}>{ROLE[u.role] || "Consultor"}</div>
          </div>
          <span className={c.seen} style={u.online ? { color: "#15803d", fontWeight: 600 } : undefined} title={u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString("pt-BR") : undefined}>{lastSeenText(u.lastSeenAt, u.online)}</span>
        </div>
      ))}
      {users.length > limit && <button type="button" className={c.link} style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>{all ? "Mostrar menos" : `Ver todos (${users.length})`}</button>}
    </GlowPanel>
  );
};
