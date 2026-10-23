import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import NumberTicker from "../NumberTicker";

// ---- PageHeader: the title of a screen, one line saying what it is for, and the actions on the right
export const PageHeader = ({ title, subtitle, actions, children }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
    <div style={{ minWidth: 0 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</h1>
      {subtitle ? <div style={{ marginTop: 4, fontSize: 14, opacity: 0.7, maxWidth: 720 }}>{subtitle}</div> : null}
      {children}
    </div>
    {actions ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{actions}</div> : null}
  </div>
);

// ---- Section: a titled block (a card) with an optional action; `flat` leaves the card out
export const Section = ({ title, hint, icon, action, flat, children, style }) => (
  <section className={flat ? undefined : "ui-card"} style={{ padding: flat ? 0 : 20, minWidth: 0, ...style }}>
    {(title || action) && (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, letterSpacing: "-0.01em" }}>{icon}{title}</h2>
          {hint ? <div style={{ marginTop: 3, fontSize: 12.5, opacity: 0.65 }}>{hint}</div> : null}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

// ---- StatCard: one number at a glance (the value is neutral; colour only when it means something)
export const StatCard = ({ label, value, unit, delta, hint, icon, tone, onClick, format }) => {
  const Tag = onClick ? "button" : "div";
  const up = typeof delta === "number" ? delta > 0 : null;
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`ui-card ui-lift${onClick ? " ui-press" : ""}`}
      style={{ padding: "16px 18px", textAlign: "left", font: "inherit", color: "inherit", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, fontSize: 12.5, opacity: 0.75, minHeight: 34 }}>
        <span>{label}</span>
        {icon ? <span style={{ opacity: 0.8, display: "inline-flex" }}>{icon}</span> : null}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: tone || undefined }}>
        {typeof value === "number" && !format ? <NumberTicker value={value} /> : format ? format(value) : value}
        {unit ? <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.6, marginLeft: 4 }}>{unit}</span> : null}
      </div>
      {(delta !== undefined && delta !== null) || hint ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85 }}>
          {typeof delta === "number" ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: up ? "rgba(22,163,74,.14)" : delta < 0 ? "rgba(220,38,38,.12)" : "rgba(127,140,160,.18)", color: up ? "#15803d" : delta < 0 ? "#b91c1c" : "inherit" }}>
              {up ? <ArrowUpRight size={12} /> : delta < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}{Math.abs(delta)}%
            </span>
          ) : null}
          {hint ? <span style={{ opacity: 0.8 }}>{hint}</span> : null}
        </div>
      ) : null}
    </Tag>
  );
};

// ---- EmptyState: when there is nothing to show, say why and what to do
export const EmptyState = ({ icon, title, text, action }) => (
  <div style={{ textAlign: "center", padding: "32px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
    {icon ? <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(6,147,227,.12)", color: "#0693e3" }}>{icon}</div> : null}
    <div style={{ fontWeight: 700 }}>{title}</div>
    {text ? <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 420 }}>{text}</div> : null}
    {action}
  </div>
);

// ---- Skeleton: the shape of what is loading
export const Skeleton = ({ width = "100%", height = 16, style }) => <div className="ui-skeleton" style={{ width, height, ...style }} />;
export const SkeletonCards = ({ n = 4, height = 110 }) => (
  <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
    {Array.from({ length: n }).map((_, i) => <Skeleton key={i} height={height} style={{ borderRadius: 16 }} />)}
  </div>
);

// ---- Segmented: pill tabs whose indicator slides to the active one. items = [[key, label, count?]]
export const Segmented = ({ items, value, onChange, label = "Seções" }) => {
  const refs = useRef({});
  const [ind, setInd] = useState({ left: 4, width: 0 });
  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.length]);
  return (
    <div className="ui-seg" role="tablist" aria-label={label}>
      <span className="ui-seg-ind" style={{ left: ind.left, width: ind.width }} />
      {items.map(([k, text, count]) => (
        <button key={k} ref={(el) => { refs.current[k] = el; }} type="button" role="tab" aria-selected={value === k} className="ui-seg-btn" onClick={() => onChange(k)}>
          {text}{count ? <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "rgba(6,147,227,.16)", color: "#0693e3" }}>{count}</span> : null}
        </button>
      ))}
    </div>
  );
};
