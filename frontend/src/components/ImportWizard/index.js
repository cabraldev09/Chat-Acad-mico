import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import Typography from "@material-ui/core/Typography";
import FileDownload from "@material-ui/icons/GetApp";
import CloudUpload from "@material-ui/icons/CloudUpload";
import CheckCircle from "@material-ui/icons/CheckCircle";
import ErrorOutline from "@material-ui/icons/ErrorOutline";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  steps: { display: "flex", gap: theme.spacing(1), marginBottom: theme.spacing(2) },
  step: {
    flex: 1,
    padding: theme.spacing(0.75, 1.25),
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.action.selected,
  },
  stepOn: { color: theme.palette.primary.contrastText, backgroundColor: theme.palette.primary.main },
  stepDone: { color: theme.palette.primary.main, backgroundColor: theme.palette.action.hover },
  drop: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing(0.5),
    padding: theme.spacing(4, 2),
    textAlign: "center",
    borderRadius: 14,
    border: `2px dashed ${theme.palette.divider}`,
    color: theme.palette.text.secondary,
    cursor: "pointer",
    transition: "border-color .15s, background-color .15s",
    "&:hover": { borderColor: theme.palette.primary.main, backgroundColor: theme.palette.action.hover },
    "& svg": { fontSize: 38, color: theme.palette.primary.main },
  },
  dropOn: { borderColor: theme.palette.primary.main, backgroundColor: theme.palette.action.hover },
  help: { marginTop: theme.spacing(2), padding: theme.spacing(1.5, 2), borderRadius: 12, backgroundColor: theme.palette.action.hover, fontSize: 13.5, lineHeight: 1.55 },
  summary: { display: "flex", flexWrap: "wrap", gap: theme.spacing(1), marginBottom: theme.spacing(1.5) },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600 },
  tableWrap: { maxHeight: 340, overflow: "auto", border: `1px solid ${theme.palette.divider}`, borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, textAlign: "left", padding: "8px 10px", backgroundColor: theme.palette.background.paper, borderBottom: `1px solid ${theme.palette.divider}`, whiteSpace: "nowrap", zIndex: 1 },
  td: { padding: "6px 10px", borderBottom: `1px solid ${theme.palette.divider}`, whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" },
  rowErr: { backgroundColor: "rgba(220,38,38,.07)" },
  err: { color: "#dc2626", fontSize: 12 },
  done: { display: "flex", flexDirection: "column", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(3), textAlign: "center", "& svg": { fontSize: 56, color: "#16a34a" } },
}));

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// builds { key: value } rows from a sheet, matching headers by label/alias
const mapRows = (rows, columns) => {
  const lookup = {};
  columns.forEach((c) => [c.key, c.label, ...(c.aliases || [])].forEach((a) => (lookup[norm(a)] = c.key)));
  return rows
    .map((r) => {
      const out = {};
      Object.keys(r).forEach((h) => {
        const key = lookup[norm(h)];
        if (key && String(r[h]).trim() !== "") out[key] = r[h];
      });
      return out;
    })
    .filter((r) => Object.keys(r).length);
};

// Reusable "import from spreadsheet" assistant: template download, drag & drop (.xlsx/.csv),
// server-side preview (dry run) with a verdict per line, then import.
const ImportWizard = ({ open, onClose, onDone, title, endpoint, columns, templateName, instructions = [], examples = [], extraBody = {}, extra }) => {
  const classes = useStyles();
  const input = useRef();
  const [step, setStep] = useState(0);
  const [items, setItems] = useState([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [report, setReport] = useState(null);

  const reset = () => {
    setStep(0);
    setItems([]);
    setPreview(null);
    setReport(null);
    setFileName("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const head = columns.map((c) => c.label + (c.required ? " *" : ""));
    const sheet = XLSX.utils.aoa_to_sheet([head, ...examples.map((e) => columns.map((c) => e[c.key] ?? ""))]);
    sheet["!cols"] = columns.map((c) => ({ wch: Math.max(16, c.label.length + 6) }));
    const help = XLSX.utils.aoa_to_sheet([
      ["Como preencher"],
      [""],
      ...columns.map((c) => [`${c.label}${c.required ? " (obrigatório)" : ""}`, c.hint || ""]),
      [""],
      ...instructions.map((t) => [t]),
      [""],
      ["Apague as linhas de exemplo antes de enviar. Não altere os títulos das colunas."],
    ]);
    help["!cols"] = [{ wch: 34 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Dados");
    XLSX.utils.book_append_sheet(wb, help, "Instruções");
    XLSX.writeFile(wb, `${templateName}.xlsx`);
  };

  const dry = async (list) => {
    setBusy(true);
    try {
      const { data } = await api.post(endpoint, { items: list, dryRun: true, ...extraBody });
      setPreview(data);
      setStep(1);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  const readFile = async (file) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheet = wb.Sheets[wb.SheetNames.find((n) => norm(n) === "dados") || wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      const mapped = mapRows(rows, columns);
      if (!mapped.length) {
        toast.error("Não encontrei linhas com os títulos esperados. Baixe a planilha-modelo e use os mesmos títulos.");
        return;
      }
      setFileName(file.name);
      setItems(mapped);
      await dry(mapped);
    } catch (err) {
      toast.error("Não consegui ler esse arquivo. Envie uma planilha .xlsx ou .csv.");
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(endpoint, { items, ...extraBody });
      setReport(data);
      setStep(2);
      onDone && onDone(data);
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  const okCount = preview ? preview.created + preview.updated : 0;
  const label = (st) => ({ new: "Novo", update: "Atualiza", error: "Erro" }[st] || st);
  const tone = (st) =>
    st === "error" ? { color: "#dc2626", backgroundColor: "rgba(220,38,38,.12)" } : st === "update" ? { color: "#b45309", backgroundColor: "rgba(217,119,6,.14)" } : { color: "#15803d", backgroundColor: "rgba(22,163,74,.13)" };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <div className={classes.steps}>
          {["1. Enviar planilha", "2. Conferir", "3. Concluído"].map((t, i) => (
            <div key={t} className={`${classes.step} ${i === step ? classes.stepOn : i < step ? classes.stepDone : ""}`}>
              {t}
            </div>
          ))}
        </div>

        {step === 0 && (
          <>
            {extra}
            <input ref={input} hidden type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => { readFile(e.target.files[0]); e.target.value = ""; }} />
            <div
              className={`${classes.drop} ${over ? classes.dropOn : ""}`}
              onClick={() => input.current.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files[0]); }}
            >
              {busy ? <CircularProgress size={34} /> : <CloudUpload />}
              <b style={{ color: "inherit" }}>Arraste a planilha aqui ou clique para escolher</b>
              <span>Aceita .xlsx e .csv</span>
            </div>
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <Button variant="outlined" color="primary" startIcon={<FileDownload />} onClick={downloadTemplate}>
                Baixar planilha de exemplo
              </Button>
            </div>
            <div className={classes.help}>
              <b>Colunas:</b>{" "}
              {columns.map((c, i) => (
                <span key={c.key}>
                  {c.label}
                  {c.required ? "*" : ""}
                  {i < columns.length - 1 ? ", " : ""}
                </span>
              ))}
              .{instructions.map((t) => (<div key={t}>• {t}</div>))}
            </div>
          </>
        )}

        {step === 1 && preview && (
          <>
            <div className={classes.summary}>
              <span className={classes.pill} style={tone("new")}>{preview.created} novos</span>
              <span className={classes.pill} style={tone("update")}>{preview.updated} atualizações</span>
              <span className={classes.pill} style={tone("error")}>{preview.errors} com erro</span>
              <Typography variant="body2" color="textSecondary" style={{ alignSelf: "center" }}>{fileName}</Typography>
            </div>
            <div className={classes.tableWrap}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th className={classes.th}>Linha</th>
                    <th className={classes.th}>Situação</th>
                    {columns.map((c) => (<th key={c.key} className={classes.th}>{c.label}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className={r.status === "error" ? classes.rowErr : ""}>
                      <td className={classes.td}>{r.line}</td>
                      <td className={classes.td}>
                        <span className={classes.pill} style={{ ...tone(r.status), padding: "1px 9px", fontSize: 12 }}>{label(r.status)}</span>
                        {r.error && <div className={classes.err}>{r.error}</div>}
                      </td>
                      {columns.map((c) => (<td key={c.key} className={classes.td}>{r[c.key] === null || r[c.key] === undefined ? "" : String(r[c.key])}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.errors > 0 && (
              <Typography variant="body2" style={{ marginTop: 10 }} color="textSecondary">
                <ErrorOutline style={{ fontSize: 16, verticalAlign: "text-bottom", color: "#dc2626" }} /> As linhas com erro serão ignoradas. Corrija a planilha e envie de novo, se quiser incluí-las.
              </Typography>
            )}
          </>
        )}

        {step === 2 && report && (
          <div className={classes.done}>
            <CheckCircle />
            <Typography variant="h6">Importação concluída</Typography>
            <Typography color="textSecondary">
              {report.created} novos · {report.updated} atualizados{report.errors ? ` · ${report.errors} ignorados por erro` : ""}
            </Typography>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        {step === 1 && (
          <Button variant="outlined" color="secondary" onClick={reset} disabled={busy}>Trocar planilha</Button>
        )}
        <Button variant="outlined" color="secondary" onClick={close}>{step === 2 ? "Fechar" : "Cancelar"}</Button>
        {step === 1 && (
          <Button variant="contained" color="primary" disabled={busy || okCount === 0} onClick={run}>
            {busy ? <CircularProgress size={18} /> : `Importar ${okCount} linha${okCount === 1 ? "" : "s"}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportWizard;
