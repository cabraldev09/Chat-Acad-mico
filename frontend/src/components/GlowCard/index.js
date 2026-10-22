import React from "react";
import { Paper } from "@material-ui/core";

import { tint } from "../../utils/color";

// A card. With `tone` (a colour) it gets a coloured edge and a faint wash of that colour, so a screen full of cards can be read by colour.
const GlowCard = ({ children, className = "", style, tone, ...rest }) => (
  <Paper
    variant="outlined"
    className={`glow-card ${className}`}
    style={tone ? { boxShadow: `inset 4px 0 0 ${tone}, 0 1px 2px rgba(11,66,121,.08), 0 6px 16px -8px rgba(11,66,121,.18)`, backgroundImage: `linear-gradient(135deg, ${tint(tone, 0.1)} 0%, transparent 62%)`, ...style } : style}
    {...rest}
  >
    {children}
  </Paper>
);

export default GlowCard;
