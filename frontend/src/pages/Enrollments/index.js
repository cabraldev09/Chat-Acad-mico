import React, { useContext, useEffect, useState } from "react";
import { MenuItem, TextField } from "@material-ui/core";
import { CheckCircle2, Download, ImagePlus } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import GoalsTabs from "../../components/GoalsTabs";
import api from "../../services/api";
import { ErrorState, Skeleton } from "../../components/ui";
import toastError from "../../errors/toastError";
import { fetchAllUsers } from "../../utils/fetchAllUsers";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isStrictAdmin } from "../../utils/access";
import { enrollmentsCsv } from "../../utils/enrollmentsCsv";

// the print is behind the login: opened through a blob with its own type (image or PDF)
const openProof = async (url) => {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const href = URL.createObjectURL(res.data);
    window.open(href, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch (err) { toastError(err); }
};

// Matrículas realizadas: every enrollment of the period, who did it and when, the RGM, the print attached by the consultant and whether it
// fell inside the period of the polo's goal. The management filters by polo and consultant and exports.
const iso = (d) => d.toLocaleDateString("en-CA");
const cell = { padding: "9px 12px", borderBottom: "1px solid var(--line)", fontSize: 13, textAlign: "left", verticalAlign: "middle" };
const th = { ...cell, fontSize: 12, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-2)", whiteSpace: "nowrap", position: "sticky", top: 0 };
const card = { border: "1px solid var(--line-strong)", borderRadius: 12, background: "var(--surface)", padding: 14, boxShadow: "var(--shadow-card)", minWidth: 0 };

export default function Enrollments() {
  const { user } = useContext(AuthContext);
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [poloId, setPoloId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [polos, setPolos] = useState([]);
  const [users, setUsers] = useState([]);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    api.get("/polos").then(({ data: d }) => setPolos(d)).catch(() => undefined);
    fetchAllUsers().then((list) => setUsers(list.filter((u) => u.role === "consultor" || u.profile === "admin" || u.role === "coordenacao"))).catch(() => undefined);
  }, []);
  useEffect(() => {
    setData(null);
    setFailed(false);
    // a load that failed says so and offers to try again: it is never shown as "no enrollments"
    api.get("/enrollments", { params: { from, to, poloId: poloId || undefined, ownerId: ownerId || undefined } }).then(({ data: d }) => setData(d)).catch((e) => { toastError(e); setFailed(true); });
  }, [from, to, poloId, ownerId, again]);
  const rows = data ? data.rows : [];
  const download = () => {
    // name and RGM only for the administration; the other profiles get the identifier of the lead (utils/enrollmentsCsv)
    const csv = enrollmentsCsv(rows, { full: isStrictAdmin(user) || (!!user && user.role === "admin") });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `matriculas-${from}-a-${to}.csv`; a.click();
  };
  return (
    <MainContainer>
      <MainHeader><Title>Metas</Title></MainHeader>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 24 }}>
        <GoalsTabs current="enrollments" />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <TextField size="small" variant="outlined" type="date" label="De" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" variant="outlined" type="date" label="Até" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField select size="small" variant="outlined" label="Polo" value={poloId} onChange={(e) => setPoloId(e.target.value)} style={{ minWidth: 200 }}>
            <MenuItem value="">Todos os polos</MenuItem>
            {polos.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" variant="outlined" label="Consultor" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ minWidth: 200 }}>
            <MenuItem value="">Todos</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
          </TextField>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={download} disabled={!rows.length} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "7px 12px", font: "inherit", fontWeight: 600, cursor: "pointer" }}><Download size={15} /> Exportar CSV</button>
        </div>
        {data && (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: 14 }}>
            {[["Matrículas no período", data.total], ["Dentro da meta", data.inGoal], ["Fora do período da meta", data.total - data.inGoal], ["Com print anexado", data.withProof]].map(([l, n]) => (
              <div key={l} style={card}><div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{l}</div><div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{n}</div></div>
            ))}
          </div>
        )}
        {data && data.byPolo.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {data.byPolo.map((p) => <span key={p.polo} style={{ fontSize: 12.5, border: "1px solid var(--line-strong)", borderRadius: 999, padding: "3px 10px", background: "var(--surface)" }}>{p.polo}: <b>{p.total}</b>{p.inGoal !== p.total ? ` (${p.inGoal} na meta)` : ""}</span>)}
          </div>
        )}
        {failed ? <ErrorState title="Não foi possível carregar as matrículas." onRetry={() => setAgain((n) => n + 1)} /> : !data ? <div aria-busy="true"><Skeleton height={44} style={{ marginBottom: 8 }} /><Skeleton height={44} style={{ marginBottom: 8 }} /><Skeleton height={44} /></div> : (
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Aluno", "RGM", "Curso", "Polo", "Consultor", "Quando", "Meta", "Print"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.leadId}-${r.enrollmentId || 0}`}>
                    <td style={{ ...cell, fontWeight: 700, minWidth: 160 }}>{r.name}{r.enrollmentId ? <div style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 400 }}>outro curso</div> : null}</td>
                    <td style={{ ...cell, fontVariantNumeric: "tabular-nums" }}>{r.rgm || "—"}</td>
                    <td style={{ ...cell, minWidth: 140 }}>{r.course || "—"}</td>
                    <td style={{ ...cell, minWidth: 140 }}>{r.polo || "—"}</td>
                    <td style={cell}>{r.owner || "—"}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{new Date(r.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{r.inGoal ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#0f766e", fontWeight: 600 }} title={r.goal}><CheckCircle2 size={14} /> Dentro da meta</span> : <span style={{ color: "#b45309", fontWeight: 600 }}>Fora do período</span>}</td>
                    <td style={cell}>{r.proofId ? <button type="button" onClick={() => openProof(`/leads/${r.leadId}/enrollment-proof/${r.proofId}/file`)} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 8, padding: "3px 8px", font: "inherit", fontSize: 12.5, cursor: "pointer" }}><ImagePlus size={14} /> Ver</button> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} style={{ ...cell, color: "var(--text-2)" }}>Nenhuma matrícula no período.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainContainer>
  );
}
