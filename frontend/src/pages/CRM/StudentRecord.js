import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Button, CircularProgress, makeStyles } from "@material-ui/core";
import { FileText, GraduationCap, UserCog } from "lucide-react";

import api from "../../services/api";
import TutorDialog from "../../components/TutorPicker";

// The record of the student in the lead's file: who the tutor is (the management sets or changes it) and the academic and curricular
// analyses made for the person, newest first, each one a link to open it.
const useStyles = makeStyles((theme) => ({
  box: { border: `1px solid ${theme.palette.divider}`, borderRadius: 12, padding: 14, marginBottom: 16, display: "grid", gap: 12, minWidth: 0 },
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 },
  label: { fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: theme.palette.text.secondary },
  value: { fontSize: 14, fontWeight: 600, flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" },
  btn: { textTransform: "none", borderRadius: 8, minHeight: 32, fontWeight: 600 },
  item: { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.palette.divider}`, background: "transparent", cursor: "pointer", color: "inherit", font: "inherit", minWidth: 0 },
  itemText: { minWidth: 0, flex: 1, fontSize: 13.5, lineHeight: 1.4, overflowWrap: "anywhere" },
  muted: { color: theme.palette.text.secondary, fontSize: 12.5 },
}));

const day = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? "" : d.toLocaleDateString("pt-BR"); };

export default function StudentRecord({ lead, users, manager, onChanged }) {
  const c = useStyles();
  const history = useHistory();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    api.get(`/leads/${lead.id}/analyses`).then(({ data }) => setItems(Array.isArray(data) ? data : [])).catch(() => { setItems([]); setFailed(true); });
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);

  const student = !!lead.enrolledAt || (lead.onboardingStatus && lead.onboardingStatus !== "none");
  const tutor = lead.onboardingTutorId ? (users || []).find((u) => u.id === lead.onboardingTutorId) : null;
  if (!student && items && !items.length) return null;
  return (
    <section className={c.box} aria-label="Registro do aluno">
      {student && (
        <div className={c.row}>
          <span className={c.label}>Tutor</span>
          <span className={c.value}>{lead.onboardingTutorId ? (tutor ? tutor.name : "Definido") : "Sem tutor"}</span>
          {manager && lead.onboardingStatus && lead.onboardingStatus !== "none" && (
            <Button size="small" variant="outlined" className={c.btn} startIcon={<UserCog size={14} />} onClick={() => setTutorOpen(true)}>{lead.onboardingTutorId ? "Trocar tutor" : "Atribuir tutor"}</Button>
          )}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        <span className={c.label}>Análises</span>
        {items === null ? <CircularProgress size={18} /> : failed ? <span className={c.muted}>Não foi possível carregar as análises. <Button size="small" className={c.btn} onClick={load}>Tentar de novo</Button></span>
          : !items.length ? <span className={c.muted}>Nenhuma análise registrada para esta pessoa.</span>
            : items.map((a) => (
              <button key={`${a.kind}-${a.id}`} type="button" className={c.item} onClick={() => history.push(a.kind === "academic" ? `/analise-academica/${a.id}` : `/analise-curricular/${a.id}`)}>
                {a.kind === "academic" ? <GraduationCap size={18} style={{ flex: "none" }} /> : <FileText size={18} style={{ flex: "none" }} />}
                <span className={c.itemText}>
                  <b>{a.title}</b>{a.course ? ` · ${a.course}` : ""}{a.version > 1 ? ` · versão ${a.version}` : ""}
                  <span className={c.muted} style={{ display: "block" }}>{day(a.createdAt)}{a.by ? ` · por ${a.by}` : ""}</span>
                </span>
              </button>
            ))}
      </div>
      <TutorDialog open={tutorOpen} lead={{ id: lead.id, name: lead.name, poloId: lead.poloId, tutorId: lead.onboardingTutorId }} onClose={() => setTutorOpen(false)} onDone={onChanged} />
    </section>
  );
}
