import React from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// A PDF that sits behind the login is fetched with the session and opened in a new tab
export const openPdf = async (url, apiClient = api) => {
  try {
    const { data } = await apiClient.get(url, { responseType: "blob" });
    const href = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    window.open(href, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch (err) {
    toastError(err);
  }
};

export const copyText = async (text, done = "Texto copiado.") => {
  try {
    await navigator.clipboard.writeText(text || "");
    toast.success(done);
  } catch (e) {
    toast.error("Não foi possível copiar. Selecione o texto e copie.");
  }
};

// Messages of a failed upload: the server writes them for the person
export const errorText = (err) => {
  const d = err && err.response && err.response.data;
  const raw = d && (d.error || d.message);
  return typeof raw === "string" ? raw : "Algo deu errado. Tente novamente.";
};

export const useShared = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: theme.spacing(1.75) },
  card: { borderRadius: 16, padding: theme.spacing(2), background: theme.palette.cards ? theme.palette.cards.background : theme.palette.background.paper, display: "grid", gap: theme.spacing(1) },
  kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: theme.spacing(1.25) },
  kpi: { borderRadius: 14, padding: theme.spacing(1.5, 1.75), border: theme.border ? theme.border.divider : "1px solid rgba(127,140,160,.25)" },
  kpiValue: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 },
  kpiLabel: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  row: { display: "flex", gap: theme.spacing(1), alignItems: "center", flexWrap: "wrap" },
  muted: { fontSize: 13, color: theme.palette.text.secondary },
  chip: { display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600, background: theme.palette.action.selected },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5, "& th, & td": { textAlign: "left", padding: "7px 10px", borderBottom: theme.border ? theme.border.divider : "1px solid rgba(127,140,160,.25)", verticalAlign: "top" }, "& th": { fontSize: 12, color: theme.palette.text.secondary, fontWeight: 700 } },
  tableWrap: { overflowX: "auto" },
}));

export const Kpi = ({ value, label, tone }) => {
  const c = useShared();
  const color = tone === "bad" ? "#dc2626" : tone === "good" ? "#15803d" : tone === "warn" ? "#b45309" : undefined;
  return (
    <div className={c.kpi}>
      <div className={c.kpiValue} style={{ color }}>{value}</div>
      <div className={c.kpiLabel}>{label}</div>
    </div>
  );
};

export const hours = (n) => (n || n === 0 ? `${Number(n).toLocaleString("pt-BR")} h` : "—");

export const initialsOf = (name) => (String(name || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
