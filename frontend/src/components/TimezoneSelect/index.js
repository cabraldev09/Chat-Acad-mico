import React from "react";
import { TextField, MenuItem } from "@material-ui/core";

import { BRAZIL_TIMEZONES, offsetLabel, clockIn } from "../../utils/timezones";

// Brazilian timezones by state, with the current UTC offset and the time there right now.
const TimezoneSelect = ({ value, onChange, label = "Fuso horário", helperText, ...rest }) => {
  const known = BRAZIL_TIMEZONES.some((t) => t.value === value);
  return (
    <TextField
      select
      fullWidth
      variant="outlined"
      margin="dense"
      label={label}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      helperText={helperText || (value ? `Agora são ${clockIn(value)} neste fuso.` : "")}
      InputLabelProps={{ shrink: true }}
      SelectProps={{ displayEmpty: true }}
      {...rest}
    >
      {!known && value && <MenuItem value={value}>{value}</MenuItem>}
      {BRAZIL_TIMEZONES.map((t) => (
        <MenuItem key={t.value} value={t.value}>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span>{t.label} <span style={{ opacity: 0.6 }}>· {offsetLabel(t.value)}</span></span>
            <span style={{ fontSize: 12, opacity: 0.6, whiteSpace: "normal" }}>{t.detail}</span>
          </span>
        </MenuItem>
      ))}
    </TextField>
  );
};

export default TimezoneSelect;
