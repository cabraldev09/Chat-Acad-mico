import React from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { AlertTriangle, BadgeCheck, CircleDashed, CircleSlash, Clock3, GraduationCap, Hourglass, Info, PlayCircle } from "lucide-react";

// The visual language of the analyses (portal and team screens). One idea carries it: the course as a trail of periods,
// one block per subject. A block is filled when the subject is done, ringed when it is being taken, outlined when it is
// still to do. Shape and text always say the same as the color, so nothing depends on seeing colors.

export const NAVY = "#0B4279";
export const SKY = "#0693E3";

export const useTones = () => {
  const dark = useTheme().palette.type === "dark";
  return {
    dark,
    done: { fg: dark ? "#7cc0ff" : NAVY, soft: dark ? "rgba(124,192,255,.14)" : "rgba(11,66,121,.08)", label: "Concluída", Icon: BadgeCheck },
    doing: { fg: dark ? "#38bdf8" : "#0577b8", soft: dark ? "rgba(56,189,248,.14)" : "rgba(6,147,227,.1)", label: "Cursando", Icon: PlayCircle },
    pending: { fg: dark ? "#fbbf24" : "#b45309", soft: dark ? "rgba(251,191,36,.13)" : "rgba(217,119,6,.1)", label: "A cursar", Icon: CircleDashed },
    review: { fg: dark ? "#f87171" : "#b91c1c", soft: dark ? "rgba(248,113,113,.14)" : "rgba(220,38,38,.08)", label: "Revisar", Icon: AlertTriangle },
    good: { fg: dark ? "#4ade80" : "#15803d", soft: dark ? "rgba(74,222,128,.13)" : "rgba(21,128,61,.09)", Icon: BadgeCheck },
    warn: { fg: dark ? "#fbbf24" : "#b45309", soft: dark ? "rgba(251,191,36,.13)" : "rgba(217,119,6,.1)", Icon: Hourglass },
    bad: { fg: dark ? "#f87171" : "#b91c1c", soft: dark ? "rgba(248,113,113,.14)" : "rgba(220,38,38,.08)", Icon: CircleSlash },
    info: { fg: dark ? "#7cc0ff" : NAVY, soft: dark ? "rgba(124,192,255,.14)" : "rgba(11,66,121,.08)", Icon: Info },
    line: dark ? "rgba(148,163,184,.22)" : "rgba(15,23,42,.1)",
    surface: dark ? "#1a2230" : "#ffffff",
    surface2: dark ? "#141b27" : "#f5f8fc",
    ink: dark ? "#e8edf5" : "#12202f",
    muted: dark ? "#9fb0c4" : "#566578",
  };
};

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// what a status of the academic engine means for the person: done, being taken, still to do, or to be reviewed
export const classify = (status) => {
  const s = fold(status);
  if (["APROVADO", "APROVADA", "CONCLUIDO", "CONCLUIDA", "DISPENSADO", "DISPENSADA", "AE", "AE*", "S", "EXEMPTED"].includes(s)) return "done";
  const grade = s.match(/^(?:NOTA\s*)?(\d{1,3}(?:[,.]\d{1,2})?)$/);
  if (grade) return Number(grade[1].replace(",", ".")) >= 6 ? "done" : "pending";
  if (s === "CURSANDO") return "doing";
  if (["A CURSAR", "REPROVADO", "REPROVADA", "PENDING"].includes(s)) return "pending";
  return "review";
};

export const useVisual = makeStyles((theme) => ({
  trailScroll: { overflowX: "auto", paddingBottom: 4 },
  trail: { display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(30px, 1fr)", gap: 6, alignItems: "end", minWidth: "min-content" },
  col: { display: "grid", gap: 4, justifyItems: "center", alignContent: "end", padding: "6px 3px 4px", borderRadius: 10, minWidth: 30 },
  stack: { display: "grid", gap: 4, justifyItems: "center" },
  block: { width: 16, height: 16, borderRadius: 4, boxSizing: "border-box", flex: "none" },
  periodLabel: { fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  flag: { fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" },
  legend: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, marginTop: 8 },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  tile: { display: "grid", gap: 4, borderRadius: 16, padding: "14px 16px", minWidth: 0 },
  tileTop: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600 },
  tileValue: { fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 12 },
  verdict: { display: "flex", gap: 14, alignItems: "flex-start", borderRadius: 18, padding: "16px 18px" },
  verdictTitle: { fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.25 },
  verdictText: { fontSize: 14, lineHeight: 1.55, marginTop: 4 },
  barRow: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: "8px 0" },
  barTrack: { height: 12, borderRadius: 999, overflow: "hidden", position: "relative" },
  panel: { borderRadius: 20, padding: theme.spacing(2.5), display: "grid", gap: theme.spacing(1.5) },
  panelTitle: { fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" },
  sectionTitle: { fontSize: 13, fontWeight: 700, letterSpacing: ".02em" },
  pill: { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "3px 10px 3px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
}));

const tipOf = (it, tones) => [it.name ? it.name : "Disciplina", (tones[it.kind] || tones.review).label].join(" — ");

const Block = ({ kind, tones, title }) => {
  const c = useVisual();
  const t = tones[kind] || tones.review;
  const style =
    kind === "done" ? { background: t.fg }
    : kind === "doing" ? { background: t.fg, boxShadow: `0 0 0 2px ${tones.surface}, 0 0 0 4px ${t.fg}` }
    : kind === "pending" ? { border: `2px solid ${t.fg}`, background: "transparent" }
    : { border: `2px dashed ${t.fg}`, background: "transparent" };
  return <span className={c.block} style={style} title={title} aria-hidden="true" />;
};

// items: [{ period, kind, name }]. One column per period, one block per subject.
export const CourseTrail = ({ items, current, confirmed = true, flag = "Você está aqui" }) => {
  const c = useVisual();
  const tones = useTones();
  const periods = {};
  (items || []).forEach((it) => { if (it.period) (periods[it.period] = periods[it.period] || []).push(it); });
  const keys = Object.keys(periods).map(Number).sort((a, b) => a - b);
  if (!keys.length) return null;
  const count = (k) => (items || []).filter((i) => i.kind === k && i.period).length;
  const summary = `Mapa do curso: ${count("done")} concluídas, ${count("doing")} cursando, ${count("pending")} a cursar${count("review") ? `, ${count("review")} a revisar` : ""}.`;
  return (
    <div>
      <div className={c.trailScroll} role="img" aria-label={summary}>
        <div className={c.trail}>
          {keys.map((p) => {
            const here = confirmed && current === p;
            const order = { done: 0, doing: 1, pending: 2, review: 3 };
            const list = [...periods[p]].sort((a, b) => order[a.kind] - order[b.kind]);
            return (
              <div key={p} className={c.col} style={{ background: here ? tones.info.soft : "transparent", boxShadow: here ? `inset 0 0 0 1.5px ${tones.info.fg}` : "none" }}>
                {here && <span className={c.flag} style={{ background: tones.info.fg, color: tones.dark ? "#0b1220" : "#fff" }}>{flag}</span>}
                <div className={c.stack}>
                  {list.map((it, i) => <Block key={i} kind={it.kind} tones={tones} title={tipOf(it, tones)} />)}
                </div>
                <span className={c.periodLabel} style={{ color: here ? tones.info.fg : tones.muted }}>{p}º</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={c.legend} style={{ color: tones.muted }}>
        {["done", "doing", "pending"].map((k) => (
          <span key={k} className={c.legendItem}><Block kind={k} tones={tones} />{tones[k].label}</span>
        ))}
        {count("review") > 0 && <span className={c.legendItem}><Block kind="review" tones={tones} />Revisar</span>}
      </div>
    </div>
  );
};

export const StatusPill = ({ kind, children }) => {
  const c = useVisual();
  const tones = useTones();
  const t = tones[kind] || tones.review;
  const Icon = t.Icon;
  return <span className={c.pill} style={{ background: t.soft, color: t.fg }}><Icon size={13} aria-hidden="true" />{children || t.label}</span>;
};

// the verdict of an analysis: one sentence that says where the student stands, with the reason under it
export const Verdict = ({ tone = "info", title, children, action }) => {
  const c = useVisual();
  const tones = useTones();
  const t = tones[tone] || tones.info;
  const Icon = t.Icon;
  return (
    <div className={c.verdict} style={{ background: t.soft, border: `1px solid ${t.fg}33` }} role="status">
      <Icon size={26} color={t.fg} style={{ flex: "none", marginTop: 1 }} aria-hidden="true" />
      <div style={{ minWidth: 0, flex: 1, color: tones.ink }}>
        <div className={c.verdictTitle} style={{ color: t.fg }}>{title}</div>
        {children && <div className={c.verdictText}>{children}</div>}
      </div>
      {action}
    </div>
  );
};

export const Tile = ({ icon: Icon, value, label, tone, hint }) => {
  const c = useVisual();
  const tones = useTones();
  const t = tone && tones[tone];
  return (
    <div className={c.tile} style={{ background: t ? t.soft : tones.surface2, border: `1px solid ${tones.line}` }}>
      <div className={c.tileTop} style={{ color: t ? t.fg : tones.muted }}>{Icon && <Icon size={16} aria-hidden="true" />}{label}</div>
      <div className={c.tileValue} style={{ color: t ? t.fg : tones.ink }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: tones.muted }}>{hint}</div>}
    </div>
  );
};

// stacked meter: how much is done, being taken and still to do
export const Meter = ({ done = 0, doing = 0, pending = 0, height = 14 }) => {
  const tones = useTones();
  const total = done + doing + pending || 1;
  const w = (n) => `${(n / total) * 100}%`;
  return (
    <div role="img" aria-label={`${done} concluídas, ${doing} cursando, ${pending} a cursar`} style={{ display: "flex", height, borderRadius: 999, overflow: "hidden", background: tones.line, gap: 2 }}>
      {done > 0 && <span style={{ width: w(done), background: tones.done.fg }} />}
      {doing > 0 && <span style={{ width: w(doing), background: tones.doing.fg }} />}
      {pending > 0 && <span style={{ width: w(pending), background: tones.pending.fg, opacity: 0.55 }} />}
    </div>
  );
};

export const Ring = ({ pct, size = 128, label = "concluído", onDark = false }) => {
  const tones = useTones();
  const r = 46, len = 2 * Math.PI * r;
  const track = onDark ? "rgba(255,255,255,.22)" : tones.line;
  const stroke = onDark ? "#ffffff" : tones.done.fg;
  const ink = onDark ? "#ffffff" : tones.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${pct}% ${label}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke={track} strokeWidth="11" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={stroke} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(len * Math.max(0, Math.min(100, pct))) / 100} ${len}`} transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray .8s ease" }} />
      <text x="60" y="63" textAnchor="middle" fontSize="27" fontWeight="800" fill={ink} style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</text>
      <text x="60" y="80" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={ink} opacity=".75">{label}</text>
    </svg>
  );
};

// semester by semester: the load of each one against what fits, and what is left behind
// rows: [{ term, period, load, cap, remaining, additional }]
export const SemesterBars = ({ rows }) => {
  const c = useVisual();
  const tones = useTones();
  if (!rows || !rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.cap || 0, r.load || 0)));
  return (
    <div>
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <div key={i} className={c.barRow} style={{ borderTop: i ? `1px solid ${tones.line}` : "none" }}>
            <div>
              <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{r.term || "—"}</div>
              <div style={{ fontSize: 11.5, color: tones.muted }}>{r.period ? `${r.period}º período` : "—"}{r.additional ? " · extra" : ""}</div>
            </div>
            <div>
              <div className={c.barTrack} style={{ background: tones.line }}>
                <span style={{ position: "absolute", inset: 0, width: `${((r.cap || 0) / max) * 100}%`, background: tones.done.soft, borderRight: `2px solid ${tones.done.fg}55` }} />
                <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${((r.load || 0) / max) * 100}%`, background: last ? tones.good.fg : tones.done.fg, borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 11.5, color: tones.muted, marginTop: 3 }}>Carga {r.load ?? "—"} de {r.cap ?? "—"} disciplinas</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, fontWeight: 700, color: r.remaining ? tones.pending.fg : tones.good.fg, whiteSpace: "nowrap" }}>
              {last || !r.remaining ? (last ? "Conclui" : "Sem pendências") : `Restam ${r.remaining}`}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const ForecastHero = ({ term, range, caption }) => {
  const tones = useTones();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <GraduationCap size={34} color={tones.done.fg} aria-hidden="true" />
      <div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: tones.done.fg, fontVariantNumeric: "tabular-nums" }}>{term || range}</div>
        {caption && <div style={{ fontSize: 13, color: tones.muted, marginTop: 4 }}>{caption}</div>}
      </div>
    </div>
  );
};

export const Hint = ({ children, tone = "warn" }) => {
  const tones = useTones();
  const t = tones[tone];
  const Icon = t.Icon || Clock3;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.5, color: tones.ink }}>
      <Icon size={16} color={t.fg} style={{ flex: "none", marginTop: 2 }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
};

export const initials = (name) => (String(name || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
