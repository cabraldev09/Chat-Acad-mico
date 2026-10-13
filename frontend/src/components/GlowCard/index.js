import React, { useRef } from "react";
import { Paper } from "@material-ui/core";

// Card whose border/background glow follows the cursor (Aceternity-style spotlight)
const GlowCard = ({ children, className = "", style, ...rest }) => {
  const ref = useRef(null);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <Paper
      ref={ref}
      variant="outlined"
      onMouseMove={onMove}
      className={`glow-card ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </Paper>
  );
};

export default GlowCard;
