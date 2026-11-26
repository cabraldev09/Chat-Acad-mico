import React, { useLayoutEffect, useRef, useState } from "react";
import TextField from "@material-ui/core/TextField";

import {
  brl, brlTyping, cpfClean, cpfMask, emailNormalize, isValidCpf, isValidEmail, isValidPhone, nameClean, phoneClean, phoneMask, titleCaseName,
} from "../../utils/masks";

// Fields that take the right shape while the person types. Same props as the Material UI TextField; onChange receives the clean value
// (digits, a number, the e-mail in lower case), never the event. The cursor stays where the person is typing, also in the middle.

// where the cursor goes in the formatted text: after the same number of digits (or characters) it had before it in the typed text
const caretAfter = (formatted, count, isCounted) => {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (isCounted(formatted[i])) seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
};

const useCaret = () => {
  const ref = useRef(null);
  const pending = useRef(null);
  useLayoutEffect(() => {
    if (pending.current !== null && ref.current && document.activeElement === ref.current) {
      const at = pending.current;
      try { ref.current.setSelectionRange(at, at); } catch (e) { /* inputs like e-mail have no selection */ }
    }
    pending.current = null;
  });
  return [ref, pending];
};

const isDigit = (ch) => /\d/.test(ch);

// a field whose text is a mask of digits (CPF, phone): the caret follows the digits
const DigitsField = ({ value, onChange, mask, clean, inputProps, ...props }) => {
  const [ref, pending] = useCaret();
  const shown = mask(value || "");
  return (
    <TextField
      {...props}
      value={shown}
      inputRef={ref}
      inputProps={{ inputMode: "numeric", autoComplete: "off", ...inputProps }}
      onChange={(e) => {
        const raw = e.target.value;
        const at = e.target.selectionStart ?? raw.length;
        const digitsBefore = raw.slice(0, at).replace(/\D/g, "").length;
        const next = clean(raw);
        pending.current = caretAfter(mask(next), digitsBefore, isDigit);
        onChange(next);
      }}
    />
  );
};

export const CpfField = ({ value, helperText, error, ...props }) => {
  const digits = cpfClean(value);
  const bad = digits.length === 11 && !isValidCpf(digits);
  return (
    <DigitsField
      placeholder="000.000.000-00"
      {...props}
      value={digits}
      mask={cpfMask}
      clean={cpfClean}
      error={error || bad}
      helperText={bad ? "CPF inválido: confira os números" : helperText}
    />
  );
};

export const PhoneField = ({ value, helperText, error, onBlur, ...props }) => {
  const [touched, setTouched] = useState(false);
  const digits = phoneClean(value);
  const bad = touched && !!digits && !isValidPhone(digits);
  return (
    <DigitsField
      placeholder="(69) 99999-9999"
      {...props}
      value={digits}
      mask={phoneMask}
      clean={phoneClean}
      inputProps={{ inputMode: "tel", ...(props.inputProps || {}) }}
      onBlur={(e) => { setTouched(true); if (onBlur) onBlur(e); }}
      error={error || bad}
      helperText={bad ? "Telefone incompleto: DDD e número" : helperText}
    />
  );
};

export const EmailField = ({ value, onChange, helperText, error, onBlur, inputProps, ...props }) => {
  const [touched, setTouched] = useState(false);
  const text = value || "";
  const bad = touched && !!text && !isValidEmail(text);
  return (
    <TextField
      type="email"
      {...props}
      value={text}
      inputProps={{ autoCapitalize: "none", autoCorrect: "off", spellCheck: false, ...inputProps }}
      onChange={(e) => onChange(emailNormalize(e.target.value))}
      onBlur={(e) => { setTouched(true); if (onBlur) onBlur(e); }}
      error={error || bad}
      helperText={bad ? "E-mail incompleto: confira o @ e o domínio" : helperText}
    />
  );
};

// name and city: each word with the first letter in capitals while typing; the extra spaces go when leaving the field
const WordsField = ({ value, onChange, onBlur, ...props }) => {
  const [ref, pending] = useCaret();
  return (
    <TextField
      {...props}
      value={value || ""}
      inputRef={ref}
      onChange={(e) => {
        const raw = e.target.value;
        pending.current = e.target.selectionStart ?? raw.length;
        onChange(titleCaseName(raw));
      }}
      onBlur={(e) => {
        const cleaned = nameClean(e.target.value);
        if (cleaned !== (value || "")) onChange(cleaned);
        if (onBlur) onBlur(e);
      }}
    />
  );
};

export const NameField = (props) => <WordsField autoComplete="name" {...props} />;
export const CityField = (props) => <WordsField autoComplete="address-level2" {...props} />;

// money in reais: the digits fill from the right (12145 → R$ 121,45); onChange gets the number, or emptyValue (null, or 0 for a fee
// that can be waived) when the field is emptied
export const CurrencyField = ({ value, onChange, inputProps, emptyValue = null, ...props }) => {
  const shown = value === null || value === undefined || value === "" ? "" : brl(value);
  return (
    <TextField
      placeholder="R$ 0,00"
      {...props}
      value={shown}
      inputProps={{ inputMode: "decimal", autoComplete: "off", ...inputProps }}
      onChange={(e) => {
        const typed = brlTyping(e.target.value).value;
        onChange(typed === null ? emptyValue : typed);
      }}
    />
  );
};
