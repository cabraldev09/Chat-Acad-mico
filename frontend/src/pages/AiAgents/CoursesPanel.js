import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@material-ui/core";
import { Scale } from "lucide-react";

import api from "../../services/api";
import { Section } from "../../components/ui";

// The courses the agent talks about, each one with the format and the share of practical classes that the MEC asks for (the same the agent says and
// the consultant sees in the grade). The rules of the team for a course are edited in the dialog.
export default function CoursesPanel({ onEditRules, onGrades, onMaterials }) {
  const [grades, setGrades] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/grades").then(({ data }) => setGrades(data.grades || [])).catch(() => setGrades([]));
  }, []);

  const list = useMemo(() => (grades || []).filter((g) => !q.trim() || String(g.courseName).toLowerCase().includes(q.trim().toLowerCase())), [grades, q]);
  const tone = (g) => (g.mec && g.mec.semPratica ? "#15803d" : "#b45309");
  return (
    <Section title="Cursos e regras do MEC" hint="Formato de cada curso e a prática presencial que o MEC exige. A IA e o consultor dizem o mesmo.">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar curso" aria-label="Buscar curso" style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--ui-border)", font: "inherit", background: "var(--ui-surface)", color: "inherit" }} />
        <Button size="small" variant="outlined" startIcon={<Scale size={15} />} onClick={onEditRules} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Editar regras do MEC</Button>
        <Button size="small" variant="outlined" onClick={onGrades} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Cursos e grades</Button>
        {onMaterials && <Button size="small" variant="contained" color="primary" disableElevation onClick={onMaterials} style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}>Prints e textos dos cursos</Button>}
      </div>
      {grades === null ? <div className="ui-skeleton" style={{ height: 120, borderRadius: 12 }} /> : list.length === 0 ? <div style={{ fontSize: 14, opacity: 0.7 }}>Nenhum curso encontrado.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 520 }}>
            <thead><tr style={{ textAlign: "left", opacity: 0.7 }}><th style={{ padding: "6px 8px" }}>Curso</th><th style={{ padding: "6px 8px" }}>Formato</th><th style={{ padding: "6px 8px" }}>Prática exigida</th><th style={{ padding: "6px 8px" }}>Duração</th></tr></thead>
            <tbody>
              {list.map((g) => (
                <tr key={g.id} style={{ borderTop: "1px solid var(--ui-border)" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 600 }}>{g.courseName}</td>
                  <td style={{ padding: "7px 8px", color: tone(g), fontWeight: 600 }}>{g.mec ? g.mec.formato : "—"}</td>
                  <td style={{ padding: "7px 8px" }} title={g.mec && g.mec.fonte}>{g.mec ? (g.mec.semPratica ? "Sem aulas práticas" : `${g.mec.percentualPresencial}% presencial`) : "—"}</td>
                  <td style={{ padding: "7px 8px" }}>{g.durationSemesters ? `${g.durationSemesters} semestres` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
