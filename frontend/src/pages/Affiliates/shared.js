import { makeStyles } from "@material-ui/core";
import api from "../../services/api";

export const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const day = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
export const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const KINDS = [
  ["banner", "Banner"],
  ["copy", "Texto pronto"],
  ["video", "Vídeo"],
  ["course_info", "Informações do curso"],
  ["course_list", "Lista de cursos e formatos"],
  ["campaign", "Campanha"],
  ["other", "Outro"],
];
export const KIND_LABEL = Object.fromEntries(KINDS);

export const BONUS_STATUS = {
  pending: { label: "A aprovar", color: "#b45309", bg: "rgba(245,158,11,.16)" },
  approved: { label: "Aprovada", color: "#0b4279", bg: "rgba(6,147,227,.16)" },
  paid: { label: "Paga", color: "#15803d", bg: "rgba(22,163,74,.16)" },
  cancelled: { label: "Cancelada", color: "#b91c1c", bg: "rgba(220,38,38,.14)" },
};

export const PIX_TYPES = [["cpf", "CPF"], ["cnpj", "CNPJ"], ["phone", "Celular"], ["email", "E-mail"], ["random", "Chave aleatória"]];

export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export const useStyles = makeStyles((theme) => ({
  page: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
  body: { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingBottom: theme.spacing(2), ...theme.scrollbarStyles },
  kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: theme.spacing(1.5), marginBottom: theme.spacing(2) },
  kpi: { padding: theme.spacing(1.5, 2), animation: "page-in .45s var(--ease-out) both" },
  kpiValue: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15 },
  kpiLabel: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  toolbar: { display: "flex", gap: theme.spacing(1), alignItems: "center", flexWrap: "wrap", marginBottom: theme.spacing(1.5) },
  grow: { flex: 1, minWidth: 180 },
  list: { display: "grid", gap: theme.spacing(1) },
  row: {
    display: "grid", gridTemplateColumns: "44px minmax(0, 1.4fr) minmax(0, 1.6fr) auto", gap: theme.spacing(1.5), alignItems: "center",
    padding: theme.spacing(1.25, 1.5), cursor: "pointer", animation: "page-in .35s var(--ease-out) both",
    transition: "box-shadow .2s, border-color .2s, transform .2s",
    "&:hover": { borderColor: theme.palette.accent.main, boxShadow: "0 10px 26px -16px rgba(11,66,121,.5)", transform: "translateY(-1px)" },
    [theme.breakpoints.down("sm")]: { gridTemplateColumns: "44px minmax(0, 1fr) auto", "& $rowStats": { gridColumn: "1 / -1" } },
  },
  avatar: {
    width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 15,
    background: "linear-gradient(135deg, #0B4279, #0693E3)", boxShadow: "0 6px 14px -6px rgba(11,66,121,.6)",
  },
  name: { fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sub: { fontSize: 12.5, color: theme.palette.text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowStats: { display: "flex", gap: theme.spacing(2.5), flexWrap: "wrap" },
  stat: { display: "grid", lineHeight: 1.2, "& b": { fontSize: 16, fontVariantNumeric: "tabular-nums" }, "& span": { fontSize: 11.5, color: theme.palette.text.secondary } },
  chip: { display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  empty: { padding: theme.spacing(6, 2), textAlign: "center", color: theme.palette.text.secondary },
  drawer: { width: 540, maxWidth: "100vw", display: "flex", flexDirection: "column", height: "100%" },
  drawerHead: { padding: theme.spacing(2, 2.5), display: "flex", gap: theme.spacing(1.5), alignItems: "center", borderBottom: theme.border.divider },
  drawerBody: { flex: 1, overflowY: "auto", padding: theme.spacing(2, 2.5, 4), ...theme.scrollbarStyles },
  section: { marginBottom: theme.spacing(3) },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: theme.spacing(1), color: theme.palette.text.secondary },
  linkBox: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(1, 1.25), borderRadius: theme.borderRadius.small, border: theme.border.divider, background: theme.palette.action.hover, "& code": { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 } },
  mini: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(0.75, 0), borderBottom: theme.border.divider, "&:last-child": { borderBottom: 0 } },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: theme.spacing(1.5) },
  card: { padding: theme.spacing(1.75), display: "flex", flexDirection: "column", gap: theme.spacing(0.75), animation: "page-in .35s var(--ease-out) both" },
  cardTop: { display: "flex", gap: theme.spacing(1.25), alignItems: "center" },
  kindIcon: { width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", color: theme.palette.accent.main, background: "rgba(6,147,227,.12)", flex: "none" },
  actions: { display: "flex", gap: 4, marginLeft: "auto", flex: "none" },
}));

export { fetchAllUsers } from "../../utils/fetchAllUsers";
