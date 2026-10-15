import React from "react";
import { TextField } from "@material-ui/core";

// A whole-number field that starts empty: the "0" is only a faded mask (placeholder), so typing 3 gives 3 and not 30.
//   value    number | null | "" (0 and empty both show the mask)
//   onChange receives a number, or null when nullable and the field was cleared (otherwise 0)
const NumberField = ({ value, onChange, nullable = false, placeholder = "0", max = 99999, ...rest }) => {
  const shown = value === null || value === undefined || value === "" || Number(value) === 0 ? "" : String(Number(value));
  return (
    <TextField
      {...rest}
      value={shown}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      inputProps={{ ...(rest.inputProps || {}), inputMode: "numeric", pattern: "[0-9]*", autoComplete: "off" }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 6);
        if (!digits) return onChange(nullable ? null : 0);
        return onChange(Math.min(max, Number(digits)));
      }}
    />
  );
};

export default NumberField;
