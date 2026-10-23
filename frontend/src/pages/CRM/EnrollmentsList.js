import React, { useEffect, useState } from "react";
import { Typography } from "@material-ui/core";
import { GraduationCap } from "lucide-react";

import api from "../../services/api";

const day = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

// every enrollment of the student, the first and the ones after it
const EnrollmentsList = ({ leadId, version }) => {
  const [list, setList] = useState([]);
  useEffect(() => {
    let off = false;
    api.get(`/leads/${leadId}/enrollments`).then(({ data }) => { if (!off) setList(Array.isArray(data) ? data : []); }).catch(() => undefined);
    return () => { off = true; };
  }, [leadId, version]);
  if (list.length < 2) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <Typography variant="subtitle2" style={{ fontWeight: 700, marginBottom: 6 }}>Matrículas do aluno ({list.length})</Typography>
      {list.map((e) => (
        <div key={`${e.id || "first"}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(127,140,160,.22)" }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(22,163,74,.14)", color: "#16a34a", flex: "none" }}><GraduationCap size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{e.number}ª matrícula{e.courseName ? ` · ${e.courseName}` : ""}</div>
            <div style={{ fontSize: 12.5, opacity: 0.7 }}>{[e.poloName, day(e.enrolledAt)].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default EnrollmentsList;
