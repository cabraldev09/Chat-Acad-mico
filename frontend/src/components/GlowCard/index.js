import React from "react";
import { Paper } from "@material-ui/core";

// A plain bordered card. The old `tone` prop (a coloured edge and wash) is accepted and ignored: colour is kept for the stage of a lead only.
const GlowCard = ({ children, className = "", style, tone, ...rest }) => (
  <Paper variant="outlined" className={`glow-card ${className}`} style={style} {...rest}>
    {children}
  </Paper>
);

export default GlowCard;
