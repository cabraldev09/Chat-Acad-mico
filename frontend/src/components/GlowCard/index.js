import React from "react";
import { Paper } from "@material-ui/core";

// A card with a thin border and a soft shadow (see styles/ui.css). `lift` makes it rise under the pointer (use it only when the whole card is clickable).
// The old `tone` prop (a coloured edge and wash) is accepted and ignored: colour is kept for the stage of a lead only.
// A card with an onClick is also a button for the keyboard and the screen reader (Tab reaches it, Enter or Space opens it).
const GlowCard = ({ children, className = "", style, tone, lift, ...rest }) => {
  const clickable = typeof rest.onClick === "function";
  const keys = clickable ? {
    role: rest.role || "button",
    tabIndex: rest.tabIndex ?? 0,
    onKeyDown: (e) => {
      if (rest.onKeyDown) rest.onKeyDown(e);
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); rest.onClick(e); }
    },
  } : {};
  return (
    <Paper variant="outlined" className={`glow-card ui-card${lift ? " ui-lift ui-press" : ""} ${className}`} style={style} {...rest} {...keys}>
      {children}
    </Paper>
  );
};

export default GlowCard;
