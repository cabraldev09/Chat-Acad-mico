import React from "react";
import { Paper } from "@material-ui/core";

// A plain card. (It used to follow the mouse with a spotlight; screens are calmer without it.)
const GlowCard = ({ children, className = "", style, ...rest }) => (
  <Paper variant="outlined" className={`glow-card ${className}`} style={style} {...rest}>
    {children}
  </Paper>
);

export default GlowCard;
