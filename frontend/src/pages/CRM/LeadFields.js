import React from "react";
import { TextField, MenuItem, Chip, makeStyles } from "@material-ui/core";

const useStyles = makeStyles((theme) => ({
  grid: { display: "grid", gap: theme.spacing(1.25), gridTemplateColumns: "1fr 1fr", [theme.breakpoints.down("xs")]: { gridTemplateColumns: "1fr" } },
  full: { gridColumn: "1 / -1" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
}));

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

  return (
    <div className={classes.grid}>
      <div className={classes.full}>{text("name", "Nome completo", { required: true, autoFocus: !lead.id })}</div>
      {text("phone", "WhatsApp / telefone", { placeholder: "(11) 99999-0000" })}
      {text("email", "E-mail", { type: "email" })}
      <Select className={classes.full} label="Curso de interesse" value={lead.courseId} onChange={set("courseId")}
        items={courses.filter((c) => c.active || c.id === lead.courseId).map((c) => ({ value: c.id, label: c.name }))} />
      <Select label="Modalidade" value={lead.modality} onChange={set("modality")} items={list(options.modalities)} />
      <Select label="Turno" value={lead.shift} onChange={set("shift")} items={list(options.shifts)} />
      {text("entryTerm", "Ingresso (ex.: 2027/1)")}
      <Select label="Forma de pagamento" value={lead.financing} onChange={set("financing")} items={list(options.financing)} />
      <Select label="Escolaridade" value={lead.educationLevel} onChange={set("educationLevel")} items={list(options.educationLevels)} />
      {text("enemScore", "Nota do ENEM (opcional)", { type: "number" })}
      {text("city", "Cidade")}
      {text("state", "UF", { inputProps: { maxLength: 2 } })}
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
  );
};

export default LeadFields;
