import React from "react";
import { Paper } from "@material-ui/core";

// A card with a thin border and a soft shadow (see styles/ui.css). `lift` makes it rise under the pointer (use it only when the whole card is clickable).
// The old `tone` prop (a coloured edge and wash) is accepted and ignored: colour is kept for the stage of a lead only.
const GlowCard = ({ children, className = "", style, tone, lift, ...rest }) => (
  <Paper variant="outlined" className={`glow-card ui-card${lift ? " ui-lift ui-press" : ""} ${className}`} style={style} {...rest}>
    {children}
  </Paper>
);

export default GlowCard;
