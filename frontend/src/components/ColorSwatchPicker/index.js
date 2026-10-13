import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Typography } from "@material-ui/core";
import CheckIcon from "@material-ui/icons/Done";

export const SWATCHES = [
  "#0B4279", "#0693E3", "#FEF84C", "#ef4444", "#f97316", "#f59e0b",
  "#22c55e", "#14b8a6", "#06b6d4", "#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#64748b",
];

const readableOn = (hex) => {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#0a2a4d" : "#fff";
};

const useStyles = makeStyles((theme) => ({
  root: { display: "flex", flexDirection: "column", gap: theme.spacing(1.25) },
  label: { color: theme.palette.text.secondary, fontSize: 13, fontWeight: 500 },
  grid: { display: "flex", flexWrap: "wrap", gap: theme.spacing(1) },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "2px solid transparent",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
    outlineOffset: 2,
    boxShadow: `inset 0 0 0 1px rgba(0,0,0,.12)`,
    transition: "transform .18s var(--ease-spring), box-shadow .18s",
    "&:hover": { transform: "scale(1.14)" },
    "& .ico": { fontSize: 16, animation: "pop-in .2s var(--ease-out)" },
  },
  swatchActive: {
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px currentColor`,
  },
  row: { display: "flex", alignItems: "center", gap: theme.spacing(1.5), flexWrap: "wrap" },
  hex: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    border: theme.border.divider,
    borderRadius: theme.borderRadius.input,
    padding: theme.spacing(0.5, 1),
    background: theme.palette.cards.background,
    "&:focus-within": {
      borderColor: theme.palette.accent.main,
      boxShadow: `0 0 0 3px ${theme.palette.accent.main}30`,
    },
  },
  hexDot: { width: 18, height: 18, borderRadius: 5, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" },
  hexInput: {
    border: 0,
    outline: 0,
    background: "transparent",
    width: 84,
    fontFamily: "inherit",
    fontSize: 14,
    color: theme.palette.text.primary,
    textTransform: "uppercase",
  },
  native: { width: 0, height: 0, opacity: 0, position: "absolute", pointerEvents: "none" },
  preview: {
    borderRadius: theme.borderRadius.pill,
    padding: "3px 12px",
    fontSize: 13,
    fontWeight: 500,
    transition: "background-color .2s, color .2s",
  },
}));

const ColorSwatchPicker = ({ label, value, onChange, previewText }) => {
  const classes = useStyles();
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#0693E3";

  return (
    <div className={classes.root}>
      {label && <span className={classes.label}>{label}</span>}
      <div className={classes.grid} role="radiogroup" aria-label={label}>
        {SWATCHES.map((c) => {
          const active = c.toLowerCase() === (value || "").toLowerCase();
          return (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={active}
              aria-label={c}
              onClick={() => onChange(c)}
              className={`${classes.swatch} ${active ? classes.swatchActive : ""}`}
              style={{ background: c, color: c }}
            >
              {active && <CheckIcon style={{ color: readableOn(c) }} />}
            </button>
          );
        })}
      </div>
      <div className={classes.row}>
        <label className={classes.hex}>
          <span className={classes.hexDot} style={{ background: color }} />
          <input
            className={classes.hexInput}
            value={value || ""}
            maxLength={7}
            spellCheck={false}
            placeholder="#0693E3"
            onChange={(e) => {
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              onChange(v);
            }}
          />
        </label>
        {previewText !== undefined && (
          <span className={classes.preview} style={{ background: color, color: readableOn(color) }}>
            {previewText || "Prévia"}
          </span>
        )}
      </div>
    </div>
  );
};

export default ColorSwatchPicker;
