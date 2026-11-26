import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog, IconButton, Button, TextField, MenuItem, Typography, makeStyles, Collapse, FormControlLabel, Switch,
  CircularProgress, DialogTitle, DialogContent, DialogActions,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { X, Save, Download, SendHorizonal, ChevronDown, SlidersHorizontal, Type, Plus, Trash2, GraduationCap, Wallet, Copy, MessageSquare, CalendarClock, Lock, Check, CopyPlus, FilePlus2, AlertTriangle } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { termLabel } from "./LeadFields";
import { CurrencyField } from "../../components/MaskedFields";
import { brl as brlText } from "../../utils/masks";

const useStyles = makeStyles((theme) => ({
  paper: { background: theme.palette.background.default },
  top: { display: "flex", alignItems: "center", gap: 12, padding: theme.spacing(1.25, 2.5), borderBottom: theme.border.divider, background: theme.palette.cards.background },
  title: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" },
  layout: { flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "480px 1fr", [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr", gridTemplateRows: "auto 1fr" } },
  form: { overflowY: "auto", overflowX: "hidden", padding: theme.spacing(2), borderRight: theme.border.divider, ...theme.scrollbarStyles },
  card: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 14, padding: theme.spacing(2), marginBottom: theme.spacing(1.5) },
  cardHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, marginBottom: theme.spacing(1.25) },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.spacing(1.25) },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: theme.spacing(1.25) },
  facts: { display: "flex", flexWrap: "wrap", gap: 6, margin: theme.spacing(0.25, 0, 1) },
  fact: { fontSize: 12.5, fontWeight: 500, padding: "2px 10px", borderRadius: 999, background: theme.palette.action.selected },
  note: { fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2 },
  firstBox: { marginTop: 10, padding: "8px 12px", borderRadius: 10, border: `1px solid ${theme.palette.divider}`, display: "flex", flexDirection: "column" },
  firstHead: { fontSize: 12.5, fontWeight: 700, color: theme.palette.text.secondary, textTransform: "uppercase", letterSpacing: ".04em" },
  adv: { cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, userSelect: "none", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", width: "100%", padding: 0 },
  stage: { overflow: "auto", padding: theme.spacing(2.5), background: theme.palette.type === "dark" ? "#050a12" : "#e9eef5", display: "flex", flexDirection: "column", alignItems: "center", gap: theme.spacing(1.5) },
  chips: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  chip: { background: theme.palette.cards.background, border: theme.border.divider, borderRadius: 999, padding: "3px 12px", fontSize: 13, fontWeight: 500 },
  sheetBox: { width: "100%", maxWidth: 860, flex: 1, minHeight: 0, position: "relative" },
  sheet: { width: 860, height: 1200, background: "#fff", borderRadius: 4, boxShadow: "0 18px 50px -20px rgba(11,66,121,.45)", border: 0, transition: "opacity .2s", transformOrigin: "top left", position: "absolute", top: 0, left: 0 },
  foot: { display: "flex", alignItems: "center", gap: 8, padding: theme.spacing(1.25, 2.5), borderTop: theme.border.divider, background: theme.palette.cards.background, flexWrap: "wrap" },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center" },
  deadline: { display: "grid", gap: 10, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: theme.spacing(1), [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr 1fr" } },
  dl: { borderRadius: 12, padding: theme.spacing(1, 1.25), background: theme.palette.action.hover, minWidth: 0 },
  dlMain: { background: theme.palette.type === "dark" ? "rgba(37,99,235,.18)" : "#e8f0ff", boxShadow: `inset 0 0 0 1px ${theme.palette.primary.main}` },
  dlLabel: { fontSize: 11.5, fontWeight: 600, color: theme.palette.text.secondary, textTransform: "uppercase", letterSpacing: ".03em" },
  dlValue: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
  missing: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.palette.type === "dark" ? "#fbbf24" : "#b45309", minWidth: 0 },
  footInfo: { flex: 1, minWidth: 0, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", [theme.breakpoints.down("xs")]: { flexBasis: "100%" } },
  savedAt: { fontSize: 12.5, color: theme.palette.text.secondary, display: "inline-flex", alignItems: "center", gap: 4 },
  lockRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: theme.palette.text.secondary, marginTop: 2, flexWrap: "wrap" },
}));

const ERR = {
  ERR_PROPOSAL_NO_GROSS: "Escolha o curso: a mensalidade bruta vem do catálogo.",
  ERR_PROPOSAL_FIRST_MONTHLY: "A mensalidade com bolsa precisa ser maior que zero e não pode passar da mensalidade bruta.",
  ERR_PROPOSAL_FIRST_PAYMENT: "A 1ª mensalidade não pode ser negativa nem passar da mensalidade bruta. Para não cobrar, marque Isenta.",
  ERR_NO_PROPOSAL_TEMPLATE: "Cadastre um modelo de proposta em Configurar CRM.",
  ERR_PROPOSAL_COURSE_NO_PRICE: "Este curso não tem mensalidade cadastrada. Peça à gestão para cadastrar em Cursos.",
};

const pad = (n) => String(n).padStart(2, "0");
const fmtDay = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
// the 1st monthly fee is due on the boleto deadline of the class; the 2nd on the contracted day of the following month
const dueDatesOf = (t, dueDay) => {
  const [y, m] = t.boletoDeadline.split("-").map(Number);
  const d = Math.min(28, Math.max(1, Math.round(Number(dueDay) || 10)));
  return { firstDueDate: t.boletoDeadline, secondDueDate: `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-${pad(d)}` };
};
const turmaFields = (t, dueDay) => (t
  ? { turma: t.key, entryTerm: t.term, installments: String(t.installments), entryTurma: t.name, releaseDate: t.releaseDate || "", ...dueDatesOf(t, dueDay) }
  : { turma: "", entryTurma: "", releaseDate: "" });
const keyOf = (calendar, p) => {
  if (!p.entryTurma) return "";
  const t = (calendar || []).find((x) => x.name === p.entryTurma && x.term === `${p.startYear}/${p.startSemester}`);
  return t ? t.key : "";
};
// what the proposal must say before the PDF or the sending (the server checks the same)
const missingOf = (f, courseId) => {
  const out = [];
  if (!courseId) out.push("curso");
  if (!f.admissionType && f.planType !== "parcelado") out.push("forma de ingresso");
  if (!(f.firstExempt ? f.secondDueDate || f.firstDueDate : f.firstDueDate)) out.push("vencimento da 1ª mensalidade");
  return out;
};

// "1.200,50" and "1200,50" are R$ 1.200,50; without a comma, a dot is a decimal point unless 3 digits follow it ("1.99" = 1,99; "1.200" = 1200)
const toNum = (v) => {
  const s = String(v ?? "").trim();
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(t);
  return Number.isNaN(n) ? 0 : n;
};
const money = (n) => (n === null || n === undefined ? "" : Number(n).toFixed(2).replace(".", ","));
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// the monthly fee with the scholarship (proposals made before it had its own field kept it in firstMonthly)
const baseOf = (p) => (Number(p.monthly) > 0 ? Number(p.monthly) : Number(p.firstMonthly) || 0);

// What is wrong with the commercial values, field by field, before anything goes to the preview: the monthly fee with the
// scholarship above zero and never above the gross one, the scholarship between 0% and 100%, the 1st installment within the gross.
export const problemsOf = (f) => {
  const out = {};
  if (!f) return out;
  const g = toNum(f.gross);
  const m = toNum(f.first);
  const b = toNum(f.bolsa);
  // with no gross fee yet (no course chosen) there is nothing to compare: the missing course is said at the bottom
  if (g > 0 && String(f.first ?? "") !== "" && !(m > 0)) out.first = "Informe um valor maior que zero";
  else if (g > 0 && m > g) out.first = `Não pode passar da mensalidade bruta (${brlText(g)})`;
  if (String(f.bolsa ?? "") !== "" && (b < 0 || b > 100)) out.bolsa = "A bolsa fica entre 0% e 100%";
  if (!f.firstExempt && !f.firstSame && String(f.firstPay ?? "") !== "" && g > 0 && toNum(f.firstPay) > g) out.firstPay = `Não pode passar da mensalidade bruta (${brlText(g)})`;
  return out;
};
// the scholarship as typed: digits and one comma, two decimals at most
const percentTyping = (v) => {
  const clean = String(v ?? "").replace(/\./g, ",").replace(/[^\d,]/g, "");
  const [int, ...rest] = clean.split(",");
  return rest.length ? `${int},${rest.join("").slice(0, 2)}` : int;
};

// backend params -> text inputs
// one scholarship, three places: "Bolsa aplicada", "Bolsa no 1º semestre" and the fee with the scholarship are the same number. Changing
// one changes the others; "Bolsa dos demais" follows too while it cannot be different (fee fixed until the end, or no change after the 1st)
export const followBolsa = (p, v) => ({
  bolsa: v,
  bolsaFirst: v,
  ...(p.fixedUntilEnd || !p.hasRegression ? { bolsaNext: v } : {}),
});

const toForm = (p, calendar) => ({
  turma: keyOf(calendar, p), entryTurma: p.entryTurma || "", releaseDate: p.releaseDate || "", grossUnlocked: !!p.grossUnlocked,
  gross: money(p.gross), first: money(baseOf(p)), bolsa: p.gross ? money(r2((1 - baseOf(p) / p.gross) * 100)) : "",
  // the 1st installment: by default the same as the others; its own value or waived (R$ 0)
  firstSame: !p.firstExempt && (!(Number(p.firstMonthly) > 0) || Math.abs(Number(p.firstMonthly) - baseOf(p)) < 0.01),
  firstPay: money(p.firstExempt ? 0 : Number(p.firstMonthly) || baseOf(p)),
  enrollmentFee: money(p.enrollmentFee), dueDay: String(p.dueDay), installments: String(p.installments), firstDueDate: p.firstDueDate || "",
  entryTerm: `${p.startYear}/${p.startSemester}`, entrySemester: p.entrySemester || 1, courseSemesters: p.courseSemesters || p.semesters, admissionType: p.admissionType || "",
  attend: String(p.semesters), attendAuto: true,
  // the scholarship of the 1st semester IS the applied one (it comes from the fee with the scholarship); with the fee fixed until the end
  // (or no change after the 1st semester) the others have the same one
  bolsaFirst: p.gross ? money(r2((1 - baseOf(p) / p.gross) * 100)) : money(p.bolsaFirst),
  bolsaNext: p.gross && (p.fixedUntilEnd || p.hasRegression === false) ? money(r2((1 - baseOf(p) / p.gross) * 100)) : money(p.bolsaNext),
  punctualityPct: String(p.punctualityPct), lateFee1Pct: String(p.lateFee1Pct), lateFee2Pct: String(p.lateFee2Pct),
  annualMin: money(p.annualMin), annualMax: money(p.annualMax),
  schedule: (p.semestralSchedule || []).map((s) => ({ from: String(s.from), pct: money(s.pct) })),
  hasRegression: p.hasRegression !== false, hasAdjustment: p.hasAdjustment !== false, fixedUntilEnd: !!p.fixedUntilEnd,
  installmentsFixed: p.installmentsFixed ? String(p.installmentsFixed) : "", firstExempt: !!p.firstExempt, secondDueDate: p.secondDueDate || "",
  // a proposal in installments (post-graduate, technical, short courses)
  planType: p.planType || "semestral", installmentsTotal: p.installmentsTotal ? String(p.installmentsTotal) : "",
  enrollmentExempt: !!p.enrollmentExempt, certification: p.certification || "none", certificationFee: money(p.certificationFee || 0),
  singlePayment: !!p.singlePayment, singleValue: p.singleValue ? money(p.singleValue) : "",
  pixDiscountPct: money(p.pixDiscountPct || 0), pixTyping: null,
  cardInstallments: String(p.cardInstallments || 1), cardRatePct: money(p.cardRatePct || 0), cardPassInterest: p.cardPassInterest !== false,
});

// text inputs -> backend params
const toParams = (f) => {
  const [y, s] = String(f.entryTerm).split("/").map(Number);
  return {
    gross: toNum(f.gross), monthly: toNum(f.first), firstMonthly: f.firstExempt ? 0 : f.firstSame ? toNum(f.first) : toNum(f.firstPay), enrollmentFee: toNum(f.enrollmentFee), dueDay: toNum(f.dueDay), installments: toNum(f.installments),
    firstDueDate: f.firstDueDate || null, startYear: y, startSemester: s === 1 ? 1 : 2,
    courseSemesters: Number(f.courseSemesters), entrySemester: Number(f.entrySemester) || 1, admissionType: f.admissionType || null,
    attendSemesters: toNum(f.attend) || null,
    bolsaFirst: toNum(f.bolsaFirst), bolsaNext: toNum(f.bolsaNext), punctualityPct: toNum(f.punctualityPct), lateFee1Pct: toNum(f.lateFee1Pct), lateFee2Pct: toNum(f.lateFee2Pct),
    annualMin: toNum(f.annualMin), annualMax: toNum(f.annualMax), semestralSchedule: f.schedule.map((x) => ({ from: toNum(x.from), pct: toNum(x.pct) })),
    hasRegression: !!f.hasRegression, hasAdjustment: !!f.hasAdjustment, fixedUntilEnd: !!f.fixedUntilEnd,
    installmentsFixed: toNum(f.installmentsFixed) || null, firstExempt: !!f.firstExempt, secondDueDate: f.secondDueDate || null,
    installmentsTotal: toNum(f.installmentsTotal) || null, enrollmentExempt: !!f.enrollmentExempt, certification: f.certification || "none",
    certificationFee: toNum(f.certificationFee), singlePayment: !!f.singlePayment, singleValue: toNum(f.singleValue) || null,
    pixDiscountPct: toNum(f.pixDiscountPct), cardInstallments: toNum(f.cardInstallments) || 1, cardRatePct: toNum(f.cardRatePct), cardPassInterest: !!f.cardPassInterest,
    entryTurma: f.entryTurma || null, releaseDate: f.releaseDate || null, grossUnlocked: !!f.grossUnlocked,
  };
};

const ProposalStudio = ({ lead, proposalId, ctx, onClose, onSaved, ticketId }) => {
  // a proposal "avulsa" has no lead: only the name of the person (it goes in the conversation open on screen, or as a link)
  const standalone = !lead.id;
  const who = standalone
    ? { recipientName: lead.name, ...(lead.cpf !== undefined ? { recipientCpf: lead.cpf || "" } : {}), ...(lead.phone !== undefined ? { recipientPhone: lead.phone || "" } : {}) }
    : { leadId: lead.id };
  const classes = useStyles();
  const options = (ctx && ctx.options) || {};
  const [courses, setCourses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [f, setF] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [currentKey, setCurrentKey] = useState("");
  const [coursePrice, setCoursePrice] = useState(null);
  const [canUnlock, setCanUnlock] = useState(false);
  const [html, setHtml] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // the values the preview on the screen was made with (the chips read them, never a value still being typed)
  const [shown, setShown] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [texts, setTexts] = useState(false);
  const [saved, setSaved] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [cleanSnap, setCleanSnap] = useState(null); // what the last save (or the opening) looked like
  const [busy, setBusy] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [blockEdits, setBlockEdits] = useState({});
  const loadSeq = useRef(0);
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);

  // the sheet is laid out at a fixed width and scaled down to fit narrow windows
  useEffect(() => {
    if (!f || !boxRef.current) return undefined;
    const fit = () => setScale(Math.min(1, boxRef.current.clientWidth / 860));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [f]);

  const loadDefaults = useCallback(async (cId, tId, keep) => {
    const { data } = await api.get("/proposals/defaults", { params: { ...who, courseId: cId || undefined, templateId: tId || undefined } });
    setCourseId(data.courseId);
    setTemplateId(data.templateId);
    setSnapshot(data.snapshot);
    setCalendar(data.calendar || []);
    setCurrentKey(data.turmaKey || "");
    setCoursePrice(data.coursePrice);
    setCanUnlock(!!data.canUnlockGross);
    // read here, not inside the updater (which runs while drawing, out of reach of the error handling around this call)
    const fresh = toForm(data.params, data.calendar);
    setF((prev) => {
      const next = { ...fresh };
      if (keep && prev) {
        // switching course: keep the negotiated discount, the candidate's ingress choices and the class of the calendar
        if (toNum(prev.bolsa) > 0 && data.params.gross) {
          next.first = money(r2(data.params.gross * (1 - toNum(prev.bolsa) / 100)));
          next.bolsa = prev.bolsa;
        }
        ["entryTerm", "admissionType", "firstDueDate", "secondDueDate", "turma", "entryTurma", "releaseDate", "installments", "firstExempt", "firstSame", "firstPay"].forEach((k) => { next[k] = prev[k]; });
        next.entrySemester = Math.min(prev.entrySemester, next.courseSemesters);
        if (!prev.attendAuto) { next.attend = prev.attend; next.attendAuto = false; }
      }
      return next;
    });
  }, [lead.id]);

  const openProposal = useCallback(async (id) => {
    const { data } = await api.get(`/proposals/${id}`);
    // the calendar, the price of the course and who may unlock it
    const { data: d } = await api.get("/proposals/defaults", { params: { ...who, courseId: data.courseId || undefined, templateId: data.templateId || undefined } });
    setCalendar(d.calendar || []); setCurrentKey(d.turmaKey || ""); setCoursePrice(d.coursePrice); setCanUnlock(!!d.canUnlockGross);
    setSaved(data); setCourseId(data.courseId); setTemplateId(data.templateId);
    setSnapshot(data.params.snapshot); setF(toForm(data.params.params, d.calendar));
    setBlockEdits(data.params.blocks || {});
    setCleanSnap(null);
  }, [lead.id]);

  useEffect(() => {
    (async () => {
      try {
        const [c, t, i] = await Promise.all([api.get("/courses"), api.get("/proposal-templates"), api.get("/institutions")]);
        setCourses(c.data.filter((x) => x.active)); setTemplates(t.data); setInstitutions(i.data);
        if (proposalId) await openProposal(proposalId);
        else await loadDefaults(lead.courseId, null, false);
      } catch (err) { toastError(err); onClose(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyOf = () => ({ ...who, courseId, templateId, params: toParams(f), snapshot, messageBlocks: blockEdits });
  const snapOf = () => JSON.stringify(bodyOf());
  // the state right after opening counts as saved: closing without touching anything does not ask
  useEffect(() => {
    if (f && snapshot && cleanSnap === null) setCleanSnap(snapOf());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, snapshot, cleanSnap]);

  // live preview, debounced
  useEffect(() => {
    if (!f || !snapshot) return undefined;
    const seq = (loadSeq.current += 1);
    // an invalid value never reaches the preview: the last valid one stays on the screen, with the reason
    const wrong = Object.values(problemsOf(f));
    if (wrong.length) {
      setError(`${wrong[0]}. A prévia mostra os últimos valores válidos.`);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post("/proposals/preview", { ...who, proposalId: saved ? saved.id : undefined, courseId, templateId, params: toParams(f), snapshot });
        if (seq !== loadSeq.current) return;
        setHtml(data.html); setResult(data.result); setBlocks(data.messages || []); setError(""); setShown(toParams(f));
      } catch (err) {
        if (seq !== loadSeq.current) return;
        const code = err.response && err.response.data && err.response.data.error;
        setError(ERR[code] || code || "Não foi possível calcular.");
      }
    }, 280);
    return () => clearTimeout(t);
  }, [f, snapshot, courseId, templateId, lead.id, saved]);

  const set = (k) => (e) => { const v = e.target.value; setF((p) => ({ ...p, [k]: v })); };
  const field = (k, label, extra = {}) => (
    <TextField fullWidth variant="outlined" margin="dense" label={label} value={f[k]} onChange={set(k)} {...extra} />
  );
  // the scholarship: only a value between 0% and 100% moves the monthly fee
  const setBolsa = (e) => {
    const v = percentTyping(e.target.value);
    setF((p) => {
      const b = toNum(v);
      if (!(v !== "" && b >= 0 && b <= 100)) return { ...p, bolsa: v, bolsaFirst: v };
      return { ...p, ...followBolsa(p, v), first: money(r2(toNum(p.gross) * (1 - b / 100))) };
    });
  };
  const problems = problemsOf(f);
  // a money field in reais: typed from the right (12145 = R$ 121,45); the form keeps the text "121,45"
  const moneyField = (k, label, extra = {}, onValue, emptyValue = null) => (
    <CurrencyField fullWidth variant="outlined" margin="dense" label={label} value={f[k] === "" || f[k] === null || f[k] === undefined ? null : toNum(f[k])}
      emptyValue={emptyValue}
      onChange={(n) => (onValue ? onValue(n) : setF((p) => ({ ...p, [k]: n === null ? "" : money(n) })))}
      error={!!problems[k]} {...extra} helperText={problems[k] || extra.helperText} />
  );
  // a proposal in installments: the installments, the fees (charge, waive or change) and, paid at once, the ways of paying it
  const sw = (k, label, extra = {}) => (
    <FormControlLabel control={<Switch color="primary" checked={!!f[k]} disabled={!!locked} onChange={(e) => { const on = e.target.checked; setF((p) => ({ ...p, [k]: on })); }} />} label={label} {...extra} />
  );
  const plan = result && result.plan;
  const singleBase = () => (toNum(f.singleValue) > 0 ? toNum(f.singleValue) : plan && plan.single ? plan.single.value : plan ? plan.total : 0);
  const setPixValue = (n) => {
    const v = n === null ? "" : money(n);
    const base = singleBase();
    setF((p) => ({ ...p, pixTyping: v, pixDiscountPct: base > 0 ? money(r2(Math.min(100, Math.max(0, (1 - toNum(v) / base) * 100)))) : p.pixDiscountPct }));
  };
  const parcelado = () => (
    <>
      <div className={classes.grid2}>
        {field("installmentsTotal", "Parcelas", { disabled: !!locked || f.singlePayment, type: "number", inputProps: { min: 1, max: 120 }, helperText: "Vem do curso ou da duração; pode mudar" })}
        <div style={{ display: "flex", alignItems: "center" }}>{sw("singlePayment", "Parcela única")}</div>
      </div>
      {f.singlePayment && (
        <div className={classes.firstBox}>
          <div className={classes.firstHead}>Formas de pagamento</div>
          {moneyField("singleValue", "Valor do curso à vista (R$)", { disabled: !!locked, placeholder: plan ? brl(plan.total) : "R$ 0,00", helperText: "Vazio = parcelas somadas" })}
          <div className={classes.grid2}>
            {field("pixDiscountPct", "Desconto no Pix (%)", { disabled: !!locked, onChange: (e) => { const v = e.target.value; setF((p) => ({ ...p, pixDiscountPct: v, pixTyping: null })); } })}
            <CurrencyField fullWidth variant="outlined" margin="dense" label="Valor no Pix (R$)" disabled={!!locked}
              value={f.pixTyping !== null && f.pixTyping !== undefined ? (f.pixTyping === "" ? null : toNum(f.pixTyping)) : plan && plan.single ? plan.single.pix : null}
              onChange={setPixValue} onBlur={() => setF((p) => ({ ...p, pixTyping: null }))} helperText="Digite o valor ou a %: o outro se ajusta" />
          </div>
          <div className={classes.grid2}>
            {field("cardInstallments", "Cartão: em quantas vezes", { disabled: !!locked, type: "number", inputProps: { min: 1, max: 48 } })}
            {field("cardRatePct", "Juros ao mês (%)", { disabled: !!locked, helperText: "Taxa da maquininha" })}
          </div>
          {sw("cardPassInterest", "Repassar os juros ao aluno")}
          {plan && plan.single && plan.single.card && (
            <div className={classes.note}>
              Boleto {brl(plan.single.value)} · Pix {brl(plan.single.pix)} · Cartão {plan.single.card.installments}x de {brl(plan.single.card.installment)} (total {brl(plan.single.card.total)}{plan.single.card.passInterest && plan.single.card.ratePct > 0 ? ", com juros" : ", sem juros"})
            </div>
          )}
        </div>
      )}
      <div className={classes.firstBox}>
        <div className={classes.firstHead}>Taxas</div>
        {sw("enrollmentExempt", "Taxa de matrícula isenta")}
        <TextField select fullWidth variant="outlined" margin="dense" label="Taxa de certificação (ao concluir)" value={f.certification} disabled={!!locked}
          onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, certification: v })); }}>
          <MenuItem value="charge">Cobrar</MenuItem>
          <MenuItem value="exempt">Isenta</MenuItem>
          <MenuItem value="none">O curso não tem</MenuItem>
        </TextField>
        {f.certification === "charge" && moneyField("certificationFee", "Valor da taxa de certificação (R$)", { disabled: !!locked }, null, 0)}
      </div>
      {plan && !f.singlePayment && (
        <div className={classes.note}>{plan.installments} parcelas de {brl(plan.monthly)}{Math.abs(plan.first - plan.monthly) >= 0.01 ? ` (1ª: ${plan.first === 0 ? "isenta" : brl(plan.first)})` : ""} · total {brl(plan.total)}</div>
      )}
    </>
  );
  // the monthly fee with the scholarship: the scholarship follows only a value above zero and within the gross one
  const setFirst = (n) => setF((p) => {
    const v = n === null ? "" : money(n);
    const g = toNum(p.gross);
    return n > 0 && g > 0 && n <= g ? { ...p, first: v, ...followBolsa(p, money(r2((1 - n / g) * 100))) } : { ...p, first: v };
  });
  const setGross = (n) => setF((p) => {
    const b = toNum(p.bolsa);
    const v = n === null ? "" : money(n);
    return n > 0 && b >= 0 && b <= 100 ? { ...p, gross: v, first: money(r2(n * (1 - b / 100))) } : { ...p, gross: v };
  });
  const setDueDay = (e) => {
    const v = e.target.value;
    setF((p) => {
      const t = p.turma && calendar.find((x) => x.key === p.turma);
      return { ...p, dueDay: v, ...(t ? dueDatesOf(t, toNum(v)) : {}) };
    });
  };
  const pickTurma = (e) => {
    const key = e.target.value;
    setF((p) => ({ ...p, ...turmaFields(calendar.find((x) => x.key === key), toNum(p.dueDay)) }));
  };
  // the gross fee is the course's price; only the management unlocks it (and locking again brings the price back)
  const toggleGross = () => setF((p) => {
    if (p.grossUnlocked) {
      const g = coursePrice || toNum(p.gross);
      return { ...p, grossUnlocked: false, gross: money(g), first: money(r2(g * (1 - toNum(p.bolsa) / 100))) };
    }
    return { ...p, grossUnlocked: true };
  });

  const persist = async () => {
    const body = bodyOf();
    const { data } = saved ? await api.put(`/proposals/${saved.id}`, body) : await api.post("/proposals", body);
    setSaved(data);
    setSavedAt(new Date());
    setCleanSnap(JSON.stringify(body));
    onSaved && onSaved();
    return data;
  };
  const run = (name, fn) => async () => {
    setBusy(name);
    try { await fn(); } catch (err) { toastError(err); } finally { setBusy(""); }
  };

  const saveOnly = run("save", async () => { await persist(); });
  const saveAndLeave = run("leave", async () => { await persist(); setLeaveOpen(false); toast.success("Proposta salva"); onClose(); });
  const download = run("pdf", async () => {
    const p = await persist();
    const res = await api.get(`/proposals/${p.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = `Proposta - ${lead.name}.pdf`; a.click();
    URL.revokeObjectURL(url);
  });
  const send = run("send", async () => {
    const p = await persist();
    await api.post(`/proposals/${p.id}/send`, { messages: blocks.map(textOf), ...(standalone ? { ticketId } : {}) });
    toast.success("Proposta enviada ao candidato");
    onSaved && onSaved();
    setSendOpen(false);
    onClose(true);
  });
  // an "avulsa" without a conversation: the proposal is closed and its link copied, for whoever will send it
  const share = run("share", async () => {
    const p = await persist();
    const { data } = await api.post(`/proposals/${p.id}/send`, { share: true });
    try { await navigator.clipboard.writeText(data.link); toast.success("Link da proposta copiado. Envie a quem vai mandar ao candidato."); } catch (_) { toast.success(`Link da proposta: ${data.link}`); }
    onSaved && onSaved();
    onClose(true);
  });
  // a sent proposal stays as it was: a copy becomes the new draft
  const duplicate = run("dup", async () => {
    const { data } = await api.post(`/proposals/${saved.id}/duplicate`);
    onSaved && onSaved();
    await openProposal(data.id);
    toast.success("Cópia criada como rascunho");
  });
  // another proposal for the same lead (another course or condition), starting from the defaults
  const startNew = run("new", async () => {
    setSaved(null); setSavedAt(null); setBlockEdits({}); setCleanSnap(null); setHtml(""); setResult(null);
    await loadDefaults(courseId, templateId, false);
    setCleanSnap(null);
  });

  const textOf = (b) => (blockEdits[b.id] !== undefined ? blockEdits[b.id] : b.text);
  const copyText = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copiado. Cole no WhatsApp.`); } catch (e) { toast.error("Não consegui copiar. Selecione o texto e copie manualmente."); }
  };
  const locked = saved && saved.status !== "draft";
  const dirty = !!f && !locked && cleanSnap !== null && snapOf() !== cleanSnap;
  const tryClose = () => { if (dirty) setLeaveOpen(true); else onClose(); };
  const course = courses.find((c) => c.id === courseId);
  const institution = institutions.find((i) => i.id === (snapshot && snapshot.institutionId));
  const needsSemester = f && (options.admissionNeedsSemester || []).includes(f.admissionType);
  const remaining = f ? f.courseSemesters - f.entrySemester + 1 : 0;
  const attend = f ? toNum(f.attend) || remaining : 0;
  const extra = Math.max(0, attend - remaining);
  const terms = f ? [...new Set([...(options.entryTerms || []), f.entryTerm])] : [];
  const turma = f && f.turma ? calendar.find((x) => x.key === f.turma) : null;
  const missing = f ? missingOf(f, courseId) : [];
  // the warning takes the person to the field that is missing (the form is long and the field may be scrolled away)
  const goToMissing = (list) => {
    if (!list.includes("forma de ingresso")) return;
    const el = document.getElementById("proposal-admission");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  };
  const grossLocked = f && !f.grossUnlocked && !!coursePrice;
  const blocked = !f || !!busy || !!locked || !!error;

  return (
    <Dialog fullScreen open onClose={tryClose} classes={{ paper: classes.paper }}>
      <div className={classes.top}>
        <IconButton onClick={tryClose} aria-label="Fechar"><X /></IconButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={classes.title}>{saved ? `Proposta #${saved.id}` : "Nova proposta"}{saved ? (locked ? " · enviada" : " · rascunho") : ""}</div>
          <Typography variant="body2" color="textSecondary" noWrap>{lead.name}{institution ? ` · ${institution.name}` : ""}{lead.affiliate ? ` · indicado pelo afiliado ${lead.affiliate.name}` : ""}</Typography>
        </div>
        {locked && <Button variant="outlined" size="small" startIcon={<CopyPlus size={15} />} disabled={!!busy} onClick={duplicate}>Duplicar para editar</Button>}
        {saved && !locked && <Button size="small" startIcon={<FilePlus2 size={15} />} disabled={!!busy || dirty} title={dirty ? "Salve esta proposta antes de começar outra" : ""} onClick={startNew}>Nova proposta</Button>}
      </div>

      {!f ? <div style={{ margin: "auto" }}><CircularProgress /></div> : (
        <div className={classes.layout}>
          <div className={classes.form}>
            <div className={classes.card}>
              <div className={classes.cardHead}><GraduationCap size={17} /> Curso e ingresso</div>
              <Autocomplete
                disabled={!!locked} options={courses} value={course || null} openOnFocus
                getOptionLabel={(c) => c.name} getOptionSelected={(a, b) => a.id === b.id} noOptionsText="Nenhum curso encontrado"
                groupBy={(c) => c.modality || "Outros"}
                renderOption={(c) => (
                  <div style={{ display: "flex", width: "100%", gap: 8 }}>
                    <span style={{ flex: 1 }}>{c.name}</span><span style={{ opacity: 0.6 }}>{c.monthlyFee ? brl(c.monthlyFee) : ""}</span>
                  </div>
                )}
                onChange={(e, c) => c && loadDefaults(c.id, templateId, true)}
                renderInput={(params) => <TextField {...params} required variant="outlined" margin="dense" label="Curso" placeholder="Busque pelo nome" error={!locked && !courseId} helperText={!locked && !courseId ? "Obrigatório para gerar" : undefined} />}
              />
              {course && (
                <div className={classes.facts}>
                  {course.modality && <span className={classes.fact}>{course.modality}</span>}
                  {f.planType === "parcelado" ? (course.durationMonths ? <span className={classes.fact}>{course.durationMonths} meses</span> : null) : <span className={classes.fact}>{course.semesters} semestres</span>}
                  {course.category && <span className={classes.fact}>{course.category}</span>}
                </div>
              )}
              <TextField select fullWidth variant="outlined" margin="dense" label="Modelo de proposta" value={templateId || ""} disabled={!!locked}
                helperText="Cada instituição pode ter modelos com regras diferentes (parcelas, regressão, reajuste)."
                onChange={(e) => loadDefaults(courseId, e.target.value, true)}>
                {templates
                  .filter((t) => t.active !== false || t.id === templateId)
                  .filter((t) => !snapshot || !snapshot.institutionId || !(t.institutions || []).length || t.institutions.some((i) => i.id === snapshot.institutionId) || t.id === templateId)
                  .map((t) => (<MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>))}
              </TextField>
              <div className={classes.grid2}>
                {f.planType !== "parcelado" && <TextField id="proposal-admission" select fullWidth required variant="outlined" margin="dense" label="Forma de ingresso" value={f.admissionType} disabled={!!locked}
                  error={!locked && !f.admissionType} helperText={!locked && !f.admissionType ? "Obrigatório para gerar" : " "}
                  onChange={(e) => { e && e.persist && e.persist(); return (setF((p) => {
                    const entry = (options.admissionNeedsSemester || []).includes(e.target.value) ? p.entrySemester : 1;
                    return { ...p, admissionType: e.target.value, entrySemester: entry, ...(p.attendAuto ? { attend: String(p.courseSemesters - entry + 1) } : {}) };
                  })); }}>
                  {(options.admissionTypes || []).map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
                </TextField>}
                <TextField select fullWidth variant="outlined" margin="dense" label="Período de ingresso" value={f.entryTerm} onChange={set("entryTerm")} disabled={!!locked || !!turma}
                  helperText={turma ? "Vem da turma" : " "}>
                  {terms.map((t) => (<MenuItem key={t} value={t}>{termLabel(t)}</MenuItem>))}
                </TextField>
              </div>
              {f.planType !== "parcelado" && needsSemester && (
                <TextField select fullWidth variant="outlined" margin="dense" label="Semestre do curso em que ingressa" value={f.entrySemester} disabled={!!locked}
                  onChange={(e) => { e && e.persist && e.persist(); return (setF((p) => ({ ...p, entrySemester: Number(e.target.value), ...(p.attendAuto ? { attend: String(p.courseSemesters - Number(e.target.value) + 1) } : {}) }))); }}>
                  {Array.from({ length: f.courseSemesters }, (_, i) => (<MenuItem key={i + 1} value={i + 1}>{i + 1}º semestre{i === 0 ? " (início do curso)" : ""}</MenuItem>))}
                </TextField>
              )}
              {f.planType !== "parcelado" && <TextField fullWidth variant="outlined" margin="dense" label="Semestres a cursar" value={f.attend} disabled={!!locked} type="number"
                inputProps={{ min: 1, max: 20 }} onChange={(e) => { e && e.persist && e.persist(); return (setF((p) => ({ ...p, attend: e.target.value, attendAuto: false }))); }}
                helperText={extra > 0
                  ? `Currículo restante: ${remaining}. Inclui ${extra} semestre${extra > 1 ? "s" : ""} de adaptação além do que falta no curso.`
                  : attend < remaining ? `Menos que os ${remaining} restantes (aproveitamento de estudos).` : `Todos os ${remaining} semestres que faltam no currículo.`} />}
              {f.planType !== "parcelado" && !f.attendAuto && (
                <Button size="small" style={{ marginTop: 4 }} disabled={!!locked} onClick={() => setF((p) => ({ ...p, attend: String(p.courseSemesters - p.entrySemester + 1), attendAuto: true }))}>Voltar ao cálculo automático</Button>
              )}
            </div>

            <div className={classes.card}>
              <div className={classes.cardHead}><CalendarClock size={17} /> Turma e prazos</div>
              <TextField select fullWidth variant="outlined" margin="dense" label="Turma do calendário" value={f.turma} onChange={pickTurma} disabled={!!locked}
                helperText={calendar.length ? "A turma é a do período em que o aluno faz a matrícula. Os prazos vêm do calendário." : "Nenhuma turma no calendário. Cadastre em Configurar CRM ou informe as datas."}>
                {calendar.map((t) => (
                  <MenuItem key={t.key} value={t.key}>
                    <span style={{ display: "flex", gap: 8, width: "100%", alignItems: "baseline", flexWrap: "wrap" }}>
                      <b>{t.name} {t.term}</b>
                      <span style={{ opacity: 0.75 }}>boleto até {fmtDay(t.boletoDeadline)}</span>
                      {t.key === currentKey && <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>turma atual</span>}
                    </span>
                  </MenuItem>
                ))}
                <MenuItem value="">Sem turma (informar as datas)</MenuItem>
              </TextField>
              {turma ? (
                <>
                  <div className={classes.deadline}>
                    <div className={`${classes.dl} ${classes.dlMain}`}><div className={classes.dlLabel}>Prazo do boleto</div><div className={classes.dlValue}>{fmtDay(turma.boletoDeadline)}</div></div>
                    <div className={classes.dl}><div className={classes.dlLabel}>AVA liberado até</div><div className={classes.dlValue}>{turma.releaseDate ? fmtDay(turma.releaseDate) : "—"}</div></div>
                    {f.planType !== "parcelado" && <div className={classes.dl}><div className={classes.dlLabel}>Parcelas</div><div className={classes.dlValue}>{turma.installments}</div></div>}
                  </div>
                  <div className={classes.note} style={{ marginTop: 8 }}>
                    Matrículas de {fmtDay(turma.from)} a {fmtDay(turma.to)}{turma.veteranosFrom ? ` · veteranos a partir de ${fmtDay(turma.veteranosFrom)}` : ""}. A 1ª mensalidade vence no prazo do boleto (você pode mudar a data abaixo); as demais, todo dia {f.dueDay || "—"}.
                  </div>
                  {field("firstDueDate", f.firstExempt ? "1ª mensalidade (isenta) vence em" : "1ª mensalidade vence em", { type: "date", required: true, InputLabelProps: { shrink: true }, disabled: !!locked, error: !locked && !f.firstDueDate })}
                </>
              ) : (
                <div className={classes.grid2}>
                  {field("firstDueDate", f.firstExempt ? "1ª mensalidade (isenta) vence em" : "1ª mensalidade vence em", { type: "date", required: true, InputLabelProps: { shrink: true }, disabled: !!locked, error: !locked && !f.firstDueDate })}
                  {f.planType !== "parcelado" && field("installments", "Parcelas deste semestre", { disabled: !!locked })}
                </div>
              )}
              {f.firstExempt && field("secondDueDate", "2ª mensalidade vence em", { type: "date", InputLabelProps: { shrink: true }, disabled: !!locked })}
            </div>

            <div className={classes.card}>
              <div className={classes.cardHead}><Wallet size={17} /> Condições comerciais</div>
              <div className={classes.grid2}>
                {moneyField("gross", "Mensalidade bruta (R$)", { disabled: !!locked || grossLocked, helperText: grossLocked ? "Valor do curso" : f.grossUnlocked ? "Destravado pela gestão" : " " }, setGross)}
                {field("bolsa", "Bolsa aplicada (%)", { onChange: setBolsa, disabled: !!locked, error: !!problems.bolsa, helperText: problems.bolsa || " ", inputProps: { inputMode: "decimal" }, InputProps: { endAdornment: <span style={{ opacity: 0.6 }}>%</span> } })}
                {moneyField("first", f.planType === "parcelado" ? "Mensalidade (R$)" : "Mensalidade com bolsa (R$)", { disabled: !!locked || (f.planType === "parcelado" && f.singlePayment), helperText: "Valor das demais mensalidades" }, setFirst)}
                {moneyField("enrollmentFee", "Taxa de matrícula (R$)", { disabled: !!locked || (f.planType === "parcelado" && f.enrollmentExempt) }, null, 0)}
                {!(f.planType === "parcelado" && f.singlePayment) && field("dueDay", "Dia de vencimento das demais", { onChange: setDueDay, disabled: !!locked })}
              </div>
              {(canUnlock && (coursePrice || f.grossUnlocked)) ? (
                <div className={classes.lockRow}>
                  <Lock size={14} /> {f.grossUnlocked ? "A mensalidade bruta foi destravada." : "A mensalidade bruta vem do curso e fica travada para os consultores."}
                  <Button size="small" disabled={!!locked} onClick={toggleGross}>{f.grossUnlocked ? "Voltar ao valor do curso" : "Destravar"}</Button>
                </div>
              ) : null}
              {course && !coursePrice && !f.grossUnlocked && (
                <div className={classes.missing} style={{ marginTop: 4 }}><AlertTriangle size={14} /> Este curso não tem mensalidade cadastrada. {canUnlock ? "Destrave e informe o valor, ou cadastre em Cursos." : "Peça à gestão para cadastrar em Cursos."}</div>
              )}
              {canUnlock && course && !coursePrice && !f.grossUnlocked && <Button size="small" onClick={toggleGross}>Destravar e informar o valor</Button>}
              <div className={classes.note}>Mude a mensalidade com bolsa ou a bolsa: o outro valor se ajusta.</div>
              {!(f.planType === "parcelado" && f.singlePayment) && <div className={classes.firstBox}>
                <div className={classes.firstHead}>1ª mensalidade</div>
                <FormControlLabel
                  control={<Switch color="primary" checked={!!f.firstExempt} disabled={!!locked} onChange={(e) => { const on = e.target.checked; setF((p) => ({ ...p, firstExempt: on, ...(on ? {} : { firstSame: true, firstPay: p.first }) })); }} />}
                  label="Isenta (R$ 0,00)"
                />
                {!f.firstExempt && (
                  <FormControlLabel
                    control={<Switch color="primary" checked={!!f.firstSame} disabled={!!locked} onChange={(e) => { const on = e.target.checked; setF((p) => ({ ...p, firstSame: on, firstPay: on ? p.first : p.firstPay || p.first })); }} />}
                    label={`Igual às demais (${brl(toNum(f.first))})`}
                  />
                )}
                {!f.firstExempt && !f.firstSame && moneyField("firstPay", "Valor da 1ª mensalidade (R$)", { disabled: !!locked })}
              </div>}
              {f.planType === "parcelado" ? parcelado() : (<>
              {field("installmentsFixed", "Total de parcelas do curso (vazio = até o fim do curso)", { disabled: !!locked, type: "number", inputProps: { min: 1, max: 120 } })}
              <FormControlLabel
                control={<Switch color="primary" checked={!!f.fixedUntilEnd} disabled={!!locked} onChange={(e) => { const on = e.target.checked; setF((p) => ({ ...p, fixedUntilEnd: on, ...(on ? { bolsaNext: p.bolsaFirst } : {}) })); }} />}
                label="Mensalidade fixa até o fim do curso"
              />
              {!f.fixedUntilEnd && (
                <>
                  <FormControlLabel
                    control={<Switch color="primary" checked={!!f.hasRegression} disabled={!!locked} onChange={(e) => { const on = e.target.checked; setF((p) => ({ ...p, hasRegression: on, ...(!on ? { bolsaNext: p.bolsaFirst } : {}) })); }} />}
                    label="Tem regressão da bolsa (cai após o 1º semestre)"
                  />
                  <FormControlLabel
                    control={<Switch color="primary" checked={!!f.hasAdjustment} disabled={!!locked} onChange={(e) => { e && e.persist && e.persist(); return (setF((p) => ({ ...p, hasAdjustment: e.target.checked }))); }} />}
                    label="Tem reajuste semestral e anual"
                  />
                </>
              )}
              </>)}
            </div>

            <div className={classes.card}>
              <div className={classes.cardHead}><MessageSquare size={17} /> Mensagem para o WhatsApp</div>
              <div className={classes.note} style={{ marginBottom: 8 }}>Copie e cole na conversa ou envie pelo sistema. Você pode editar cada bloco.</div>
              {blocks.map((b) => (
                <div key={b.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{b.title}</span>
                    <Button size="small" startIcon={<Copy size={14} />} onClick={() => copyText(textOf(b), b.title)}>Copiar</Button>
                  </div>
                  <TextField fullWidth multiline variant="outlined" margin="dense" value={textOf(b)} disabled={!!locked}
                    onChange={(e) => { e && e.persist && e.persist(); return (setBlockEdits((m) => ({ ...m, [b.id]: e.target.value }))); }} />
                </div>
              ))}
              <Button fullWidth variant="outlined" startIcon={<Copy size={15} />} disabled={!blocks.length} onClick={() => copyText(blocks.map(textOf).join("\n\n"), "Mensagem completa")}>Copiar tudo</Button>
            </div>

            <div className={classes.card}>
              <button type="button" className={classes.adv} onClick={() => setAdvanced(!advanced)}>
                <SlidersHorizontal size={17} /> Bolsa, pontualidade e reajustes
                <ChevronDown size={16} style={{ marginLeft: "auto", transform: advanced ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              <Collapse in={advanced}>
                <div style={{ paddingTop: 12 }}>
                  <div className={classes.grid2}>
                    {field("bolsaFirst", "Bolsa no 1º semestre (%)", { disabled: !!locked, onChange: setBolsa, error: !!problems.bolsa, helperText: problems.bolsa || "A mesma da bolsa aplicada", inputProps: { inputMode: "decimal" } })}
                    {field("bolsaNext", "Bolsa dos demais (%)", f.fixedUntilEnd || !f.hasRegression
                      ? { disabled: true, helperText: f.fixedUntilEnd ? "Mensalidade fixa até o fim: a bolsa não muda" : "Sem regressão: a bolsa não muda" }
                      : { disabled: !!locked, helperText: "A partir do 2º semestre", inputProps: { inputMode: "decimal" } })}
                  </div>
                  <div className={classes.grid3}>
                    {field("punctualityPct", "Pontualidade (%)", { disabled: !!locked })}
                    {field("lateFee1Pct", "Perde dias 11–25 (%)", { disabled: !!locked })}
                    {field("lateFee2Pct", "Perde após venc. (%)", { disabled: !!locked })}
                  </div>
                  <div className={classes.grid2}>
                    {field("annualMin", "Reajuste anual mínimo (%)", { disabled: !!locked })}
                    {field("annualMax", "Reajuste anual teto (%)", { disabled: !!locked })}
                  </div>
                  <div className={classes.note} style={{ marginTop: 8 }}>Reajuste semestral (a partir do semestre…)</div>
                  {f.schedule.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <TextField variant="outlined" margin="dense" label="Semestre" value={s.from} disabled={!!locked} style={{ width: 110 }}
                        onChange={(e) => { e && e.persist && e.persist(); return (setF((p) => ({ ...p, schedule: p.schedule.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) }))); }} />
                      <TextField variant="outlined" margin="dense" label="% por semestre" value={s.pct} disabled={!!locked} style={{ flex: 1 }}
                        onChange={(e) => { e && e.persist && e.persist(); return (setF((p) => ({ ...p, schedule: p.schedule.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) }))); }} />
                      <IconButton aria-label="Excluir" size="small" disabled={!!locked} onClick={() => setF((p) => ({ ...p, schedule: p.schedule.filter((_, j) => j !== i) }))}><Trash2 size={16} /></IconButton>
                    </div>
                  ))}
                  <Button size="small" startIcon={<Plus size={14} />} disabled={!!locked} onClick={() => setF((p) => ({ ...p, schedule: [...p.schedule, { from: "", pct: "" }] }))}>Adicionar degrau</Button>
                  <div className={classes.grid2} style={{ marginTop: 8 }}>
                    <TextField select fullWidth variant="outlined" margin="dense" label="Modelo" value={templateId || ""} disabled={!!locked} onChange={(e) => loadDefaults(courseId, e.target.value, true)}>
                      {templates.filter((t) => t.active !== false || t.id === templateId).map((t) => (<MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>))}
                    </TextField>
                    <TextField select fullWidth variant="outlined" margin="dense" label="Instituição" disabled={!!locked}
                      value={(snapshot && snapshot.institutionId) || ""} onChange={(e) => setSnapshot({ ...snapshot, institutionId: e.target.value || null })}>
                      {institutions.map((i) => (<MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>))}
                    </TextField>
                  </div>
                </div>
              </Collapse>
            </div>

            <div className={classes.card}>
              <button type="button" className={classes.adv} onClick={() => setTexts(!texts)}>
                <Type size={17} /> Textos do documento
                <ChevronDown size={16} style={{ marginLeft: "auto", transform: texts ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              <Collapse in={texts}>
                <div style={{ paddingTop: 12 }}>
                  {[["observation", "Observação"], ["disclaimer", "Aviso da projeção"], ["finalMessage", "Mensagem final"], ["bolsaNote", "Nota da bolsa aplicada"]].map(([k, label]) => (
                    <TextField key={k} fullWidth multiline rows={2} variant="outlined" margin="dense" label={label} disabled={!!locked}
                      value={(snapshot && snapshot.texts && snapshot.texts[k]) || ""} onChange={(e) => { const v = e.target.value; setSnapshot((s) => ({ ...(s || {}), texts: { ...((s && s.texts) || {}), [k]: v } })); }} />
                  ))}
                </div>
              </Collapse>
            </div>
          </div>

          <div className={classes.stage}>
            {result && (
              <div className={classes.chips}>
                <span className={classes.chip}>Bolsa <b>{result.bolsaApplied.toFixed(2).replace(".", ",")}%</b></span>
                <span className={classes.chip}>1ª mensalidade <b>{shown ? (shown.firstExempt ? "isenta" : brl(shown.firstMonthly)) : "—"}</b></span>
                <span className={classes.chip}>Até o dia {shown ? shown.dueDay : f.dueDay}: <b>{brl(result.tiers.onTime)}</b></span>
                {result.rows.length > 0 && <span className={classes.chip}>Última parcela (cenário teto): <b>{brl(result.rows[result.rows.length - 1].monthlyMax)}</b></span>}
              </div>
            )}
            {error && <div className={classes.err}>{error}</div>}
            <div className={classes.sheetBox} ref={boxRef} style={{ height: 1200 * scale }}>
              <iframe title="Prévia da proposta" className={classes.sheet} srcDoc={html}
                style={{ opacity: error ? 0.45 : 1, transform: `scale(${scale})` }} />
            </div>
          </div>
        </div>
      )}

      <div className={classes.foot}>
        <div className={classes.footInfo}>
          {!locked && missing.length > 0 && (
            <button type="button" className={classes.missing} style={{ border: 0, background: "transparent", cursor: "pointer", font: "inherit", padding: 0, textAlign: "left" }}
              title="Ir até o campo" onClick={() => goToMissing(missing)}>
              <AlertTriangle size={15} style={{ flex: "none" }} /> Falta para gerar o PDF ou enviar: <u>{missing.join(", ")}</u>.
            </button>
          )}
          {!locked && (dirty
            ? <span className={classes.savedAt}>Alterações não salvas</span>
            : savedAt ? <span className={classes.savedAt}><Check size={14} /> Salvo às {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null)}
        </div>
        {!locked && <Button variant="outlined" startIcon={busy === "save" ? <CircularProgress size={16} /> : <Save size={16} />} disabled={blocked} onClick={saveOnly}>Salvar</Button>}
        {!locked && <Button variant="outlined" startIcon={busy === "leave" ? <CircularProgress size={16} /> : <Check size={16} />} disabled={blocked} onClick={saveAndLeave}>Salvar e sair</Button>}
        <Button variant="outlined" startIcon={<Download size={16} />} disabled={!f || !!busy || !!error || (!locked && missing.length > 0)} onClick={locked ? run("pdf", async () => {
          const res = await api.get(`/proposals/${saved.id}/pdf`, { responseType: "blob" });
          const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = `Proposta - ${lead.name}.pdf`; a.click(); URL.revokeObjectURL(url);
        }) : download}>{busy === "pdf" ? "Gerando…" : "Baixar PDF"}</Button>
        {!locked && standalone && <Button variant="outlined" color="primary" disabled={blocked || missing.length > 0 || busy === "share"} onClick={share}>{busy === "share" ? "Gerando..." : "Gerar link"}</Button>}
        {!locked && (!standalone || ticketId) && <Button variant="contained" color="primary" startIcon={<SendHorizonal size={16} />} disabled={blocked || missing.length > 0} onClick={() => setSendOpen(true)}>Enviar ao candidato</Button>}
      </div>

      <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} maxWidth="sm">
        <DialogTitle>Salvar antes de sair?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary">Esta proposta tem alterações que ainda não foram salvas.</Typography>
        </DialogContent>
        <DialogActions style={{ flexWrap: "wrap", gap: 6 }}>
          <Button onClick={() => setLeaveOpen(false)}>Continuar editando</Button>
          <Button color="secondary" onClick={() => { setLeaveOpen(false); onClose(); }}>Sair sem salvar</Button>
          <Button variant="contained" color="primary" disabled={!!busy || !!error} startIcon={busy === "leave" ? <CircularProgress size={16} /> : <Save size={16} />} onClick={saveAndLeave}>Salvar e sair</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar proposta a {lead.name.split(" ")[0]}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            O PDF segue anexo na conversa (mesmo canal do atendimento), o lead vai para “Proposta enviada” e o atendimento fica com você.
          </Typography>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{blocks.map((b) => (<div key={b.id} style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 10, background: "rgba(128,128,128,.12)", whiteSpace: "pre-wrap" }}>{textOf(b)}</div>))}</div>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="secondary" onClick={() => setSendOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" disabled={busy === "send"} startIcon={busy === "send" ? <CircularProgress size={16} /> : <SendHorizonal size={16} />} onClick={send}>Enviar agora</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default ProposalStudio;
