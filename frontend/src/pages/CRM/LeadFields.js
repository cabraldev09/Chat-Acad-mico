import React from "react";
import { TextField, MenuItem, Chip, makeStyles } from "@material-ui/core";
import { formatCpf, isValidCpf, onlyDigits } from "./cpf";

const useStyles = makeStyles((theme) => ({
  section: { marginBottom: theme.spacing(2.5) },
  head: { fontSize: 12.5, fontWeight: 600, color: theme.palette.text.secondary, margin: theme.spacing(0, 0, 0.5, 0.25) },
  grid: { display: "grid", gap: theme.spacing(1.25), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  full: { gridColumn: "1 / -1" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
}));

export const termLabel = (t) => {
  const m = String(t).match(/^(\d{4})\/([12])$/);
  return m ? `${m[2]}º semestre de ${m[1]}` : t;
};

const Select = ({ label, value, onChange, items, allowEmpty = true, className, ...rest }) => (
  <TextField select fullWidth variant="outlined" margin="dense" label={label} className={className}
    value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} {...rest}>
    {allowEmpty && <MenuItem value="">—</MenuItem>}
    {items.map((i) => (
      <MenuItem key={i.value} value={i.value}>{i.label}</MenuItem>
    ))}
  </TextField>
);

const LeadFields = ({ lead, onChange, options, courses, users, tags }) => {
  const classes = useStyles();
  const set = (k) => (v) => onChange({ ...lead, [k]: v });
  const text = (k, label, extra = {}) => (
    <TextField fullWidth variant="outlined" margin="dense" label={label} value={lead[k] ?? ""}
      onChange={(e) => set(k)(e.target.value)} {...extra} />
  );
  const list = (arr = []) => arr.map((v) => ({ value: v, label: v }));
  const tagIds = lead.tagIds || (lead.tags || []).map((t) => t.id);

  const course = courses.find((c) => c.id === lead.courseId);
  const needsSemester = (options.admissionNeedsSemester || []).includes(lead.admissionType);
  const maxSemester = (course && course.semesters) || 12;
  const cpf = formatCpf(lead.cpf);
  const cpfBad = onlyDigits(lead.cpf).length === 11 && !isValidCpf(lead.cpf);

  // intake periods: the administrator's list, plus whatever this lead already has
  const terms = [...new Set([...(options.entryTerms || []), ...(lead.entryTerm ? [lead.entryTerm] : [])])];

  return (
    <div>
      <div className={classes.section}>
        <div className={classes.head}>Contato</div>
        <div className={classes.grid}>
          <div className={classes.full}>{text("name", "Nome completo", { required: true, autoFocus: !lead.id })}</div>
          {text("phone", "WhatsApp / telefone", { placeholder: "(11) 99999-0000" })}
          {text("email", "E-mail", { type: "email" })}
          <TextField fullWidth variant="outlined" margin="dense" label="CPF" value={cpf} placeholder="000.000.000-00"
            onChange={(e) => set("cpf")(onlyDigits(e.target.value))} error={cpfBad}
            helperText={cpfBad ? "CPF inválido" : "Necessário para gerar a cobrança da taxa de matrícula"}
            inputProps={{ inputMode: "numeric", autoComplete: "off" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 72px", gap: 8 }}>
            {text("city", "Cidade")}
            {text("state", "UF", { inputProps: { maxLength: 2 } })}
          </div>
        </div>
      </div>

      <div className={classes.section}>
        <div className={classes.head}>Interesse e ingresso</div>
        <div className={classes.grid}>
          <Select className={classes.full} label="Curso de interesse" value={lead.courseId} onChange={set("courseId")}
            items={courses.filter((c) => c.active || c.id === lead.courseId).map((c) => ({
              value: c.id, label: `${c.name}${c.modality ? ` · ${c.modality}` : ""}`,
            }))} />
          <Select label="Forma de ingresso" value={lead.admissionType} onChange={(v) => onChange({ ...lead, admissionType: v, entrySemester: (options.admissionNeedsSemester || []).includes(v) ? lead.entrySemester || 1 : 1 })}
            items={list(options.admissionTypes)} />
          <Select label="Período de ingresso" value={lead.entryTerm || options.defaultEntryTerm} onChange={set("entryTerm")} allowEmpty={false}
            items={terms.map((t) => ({ value: t, label: termLabel(t) }))} />
          {needsSemester && (
            <>
              <Select label="Ingressa no semestre" allowEmpty={false}
                value={lead.entrySemester || 1} onChange={(v) => set("entrySemester")(Number(v))}
                items={Array.from({ length: maxSemester }, (_, i) => ({ value: i + 1, label: `${i + 1}º semestre${i === 0 ? " (início do curso)" : ""}` }))} />
              <Select label="Semestres de adaptação" allowEmpty={false}
                value={lead.extraSemesters || 0} onChange={(v) => set("extraSemesters")(Number(v))}
                items={Array.from({ length: 7 }, (_, i) => ({ value: i, label: i === 0 ? "Nenhum" : `+${i} semestre${i > 1 ? "s" : ""}` }))} />
              <div className={classes.full} style={{ fontSize: 12.5, opacity: 0.75, marginTop: -4 }}>
                A proposta projeta os semestres que ainda faltam no currículo mais os de adaptação, mesmo que passem da duração normal do curso.
              </div>
            </>
          )}
          <Select label="Momento de decisão" value={lead.decisionTimeline} onChange={set("decisionTimeline")} items={list(options.decisionTimelines)} />
          <Select label="Objetivo com o curso" value={lead.motivation} onChange={set("motivation")} items={list(options.motivations)} />
          <Select label="Escolaridade" value={lead.educationLevel} onChange={set("educationLevel")} items={list(options.educationLevels)} />
          {lead.admissionType === "ENEM" && text("enemScore", "Nota do ENEM", { type: "number" })}
        </div>
      </div>

      <div className={classes.section}>
        <div className={classes.head}>Origem e responsável</div>
        <div className={classes.grid}>
          <Select label="Origem" value={lead.source} onChange={set("source")} allowEmpty={false} items={list(options.sources)} />
          <Select label="Responsável" value={lead.ownerId} onChange={set("ownerId")} items={users.map((u) => ({ value: u.id, label: u.name }))} />
          {tags.length > 0 && (
            <div className={classes.full}>
              <div className={classes.chips}>
                {tags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <Chip key={t.id} size="small" label={t.name} clickable
                      onClick={() => set("tagIds")(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}
                      style={{ background: on ? t.color : "transparent", color: on ? "#fff" : undefined, border: `1px solid ${t.color}` }} />
                  );
                })}
              </div>
            </div>
          )}
          <div className={classes.full}>{text("notes", "Observações", { multiline: true, rows: 3 })}</div>
        </div>
      </div>
    </div>
  );
};

export default LeadFields;
