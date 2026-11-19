import React, { useEffect, useState } from "react";
import { TextField } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// The manager's panel per tutor: who has how many students, how many were actually contacted in the period, the ambientação finished
// over the enrolled in the period, the real time to the first contact (first message of the tutoring) and what is overdue now.
const iso = (d) => d.toISOString().slice(0, 10);
const cell = { padding: "9px 12px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const th = { ...cell, fontSize: 12, fontWeight: 700, color: "var(--text-2)", textAlign: "left", background: "var(--surface-2)" };
const hours = (h) => (h === null || h === undefined ? "—" : h < 1 ? "< 1 h" : h < 48 ? `${String(h).replace(".", ",")} h` : `${Math.round(h / 24)} dias`);
const rateColor = (v) => (v === null ? "var(--text-3)" : v >= 80 ? "#0f766e" : v >= 50 ? "#b45309" : "#b91c1c");

export default function TutorPanel() {
  const [to, setTo] = useState(iso(new Date()));
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400000)));
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api.get("/tutoria/panel", { params: { from, to } }).then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setData({ tutors: [] }); });
  }, [from, to]);
  const rows = data?.tutors || [];
  const download = () => {
    const head = ["Tutor", "Alunos", "Contatados no período", "Matriculados no período", "Ambientação concluída", "Concluída (%)", "1º contato (mediana, h)", "Sem 1º contato", "Atrasados", "Sem contato", "Chamados do comercial", "Com não lidas"];
    const lines = rows.map(r => [r.name, r.students, r.contacted, r.enrolled, r.done, r.doneRate ?? "", r.firstContactMedianHours ?? "", r.noContactYet, r.late, r.idle, r.calls, r.unread]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `tutoria-${from}-a-${to}.csv`; a.click();
  };
  return (
    <div style={{ border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 16, margin: "0 0 16px", boxShadow: "var(--shadow-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Desempenho por tutor</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Primeiro contato = primeira mensagem da tutoria depois da matrícula (não o clique em "Iniciar").</div>
        </div>
        <TextField size="small" variant="outlined" type="date" label="De" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" variant="outlined" type="date" label="Até" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <button type="button" onClick={download} disabled={!rows.length} style={{ border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "7px 12px", fontWeight: 600, cursor: "pointer" }}>Exportar CSV</button>
      </div>
      {!data ? <div style={{ color: "var(--text-2)", fontSize: 13 }}>Carregando…</div> : (
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Tutor", "Alunos", "Contatados", "Ambientação concluída", "1º contato (mediana)", "Sem 1º contato", "Atrasados", "Sem contato", "Chamados", "Não lidas"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.tutorId ?? "none"}>
                  <td style={{ ...cell, fontWeight: 700 }}>{r.name}</td>
                  <td style={cell}>{r.students}</td>
                  <td style={cell}>{r.contacted}</td>
                  <td style={cell}><b style={{ color: rateColor(r.doneRate) }}>{r.doneRate === null ? "—" : `${r.doneRate}%`}</b> <span style={{ color: "var(--text-2)" }}>({r.done}/{r.enrolled})</span></td>
                  <td style={cell}>{hours(r.firstContactMedianHours)}</td>
                  <td style={{ ...cell, color: r.noContactYet ? "#b91c1c" : undefined }}>{r.noContactYet}</td>
                  <td style={{ ...cell, color: r.late ? "#b91c1c" : undefined }}>{r.late}</td>
                  <td style={{ ...cell, color: r.idle ? "#b45309" : undefined }}>{r.idle}</td>
                  <td style={cell}>{r.calls}</td>
                  <td style={cell}>{r.unread}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} style={{ ...cell, color: "var(--text-2)" }}>Nenhum aluno no período.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
