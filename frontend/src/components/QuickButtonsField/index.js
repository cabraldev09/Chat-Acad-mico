import React from "react";
import { Button, TextField, makeStyles } from "@material-ui/core";
import { Plus, X } from "lucide-react";

import IconAction from "../IconAction";

// Up to 3 quick-reply buttons under a message of a bulk send. On the official API they show as buttons the person taps
// (inside the 24 h); on a QR Code connection they go as numbered options under the text.
export const MAX_BUTTONS = 3;
export const BUTTON_MAX_LEN = 20;

const useStyles = makeStyles((theme) => ({
  row: { display: "flex", alignItems: "center", gap: theme.spacing(0.5), flexWrap: "wrap", marginTop: theme.spacing(0.5) },
  field: { width: 170 },
  hint: { fontSize: 12, color: theme.palette.text.secondary, marginTop: 2 },
}));

export const buttonsPreview = (buttons) => (Array.isArray(buttons) ? buttons.map((b) => String(b || "").trim()).filter(Boolean) : []);

const QuickButtonsField = ({ value, onChange, disabled }) => {
  const classes = useStyles();
  const list = Array.isArray(value) ? value : [];
  const set = (i, text) => onChange(list.map((b, k) => (k === i ? text.slice(0, BUTTON_MAX_LEN) : b)));
  return (
    <div>
      <div className={classes.row}>
        {list.map((b, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            <TextField
              size="small" variant="outlined" margin="dense" className={classes.field} disabled={disabled}
              label={`Botão ${i + 1}`} value={b} onChange={(e) => set(i, e.target.value)}
              inputProps={{ maxLength: BUTTON_MAX_LEN, "aria-label": `Botão ${i + 1}` }}
            />
            <IconAction title="Remover botão" onClick={() => onChange(list.filter((_, k) => k !== i))}><X size={15} /></IconAction>
          </span>
        ))}
        {list.length < MAX_BUTTONS && (
          <Button size="small" variant="text" color="primary" startIcon={<Plus size={15} />} disabled={disabled} onClick={() => onChange([...list, ""])}>
            {list.length ? "Outro botão" : "Adicionar botões de resposta"}
          </Button>
        )}
      </div>
      {list.length > 0 && (
        <div className={classes.hint}>
          Até {MAX_BUTTONS} botões de {BUTTON_MAX_LEN} letras. Na API oficial aparecem como botões (dentro das 24 horas); no QR Code, como opções numeradas.
        </div>
      )}
    </div>
  );
};

export default QuickButtonsField;
