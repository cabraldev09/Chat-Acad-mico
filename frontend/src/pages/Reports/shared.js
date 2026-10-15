import React from "react";
import { makeStyles } from "@material-ui/core/styles";

// minutes -> "8 min", "1 h 20", "2 d"
export const hm = (min) => {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d`;
  const m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};

export const useShared = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const line = dark ? "rgba(255,255,255,.09)" : "#e3e9f1";
  const soft = dark ? "rgba(255,255,255,.04)" : "#f6f8fb";
  return {
    panel: { background: dark ? "#0f1826" : "#ffffff", border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25) },
    title: { fontSize: 14.5, fontWeight: 700, margin: 0, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 },
    sub: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
    stack: { display: "grid", gap: theme.spacing(2.5), minWidth: 0 },
    insight: { display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: `1px solid ${line}`, fontSize: 14, lineHeight: 1.45, "&:first-of-type": { borderTop: 0 } },
    dot: { width: 8, height: 8, borderRadius: "50%", marginTop: 7, flex: "none" },
    bar: { height: 7, borderRadius: 999, background: soft, overflow: "hidden", minWidth: 60 },
    fill: { height: "100%", borderRadius: 999, transition: "width .5s cubic-bezier(.2,.8,.2,1)" },
    num: { fontVariantNumeric: "tabular-nums" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 14, "& th": { textAlign: "left", fontSize: 12, color: theme.palette.text.secondary, fontWeight: 600, padding: "8px 10px", borderBottom: `1px solid ${line}`, whiteSpace: "nowrap" }, "& td": { padding: "10px", borderBottom: `1px solid ${line}`, verticalAlign: "middle" }, "& .r": { textAlign: "right", fontVariantNumeric: "tabular-nums" } },
    scroll: { overflowX: "auto" },
    chip: { display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "1px 8px", borderRadius: 999 },
  };
});

const TONE = { good: "#16a34a", warn: "#d97706", info: "#0693E3" };

// the sentences the system wrote about the numbers
export const Insights = ({ items, title = "Leitura do período" }) => {
  const c = useShared();
  if (!items || !items.length) return null;
  return (
    <div className={c.panel}>
      <h2 className={c.title}>{title}</h2>
      <div style={{ marginTop: 8 }}>
        {items.map((i, k) => (
          <div className={c.insight} key={k}>
            <span className={c.dot} style={{ background: TONE[i.tone] || TONE.info }} />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SlaBar = ({ pct }) => {
  const c = useShared();
  if (pct === null || pct === undefined) return <span style={{ opacity: 0.5 }}>—</span>;
  const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
      <div className={c.bar} style={{ flex: 1 }}><div className={c.fill} style={{ width: `${pct}%`, background: color }} /></div>
      <span className={c.num} style={{ fontSize: 12.5, fontWeight: 700, width: 36, textAlign: "right" }}>{pct}%</span>
    </div>
  );
};
