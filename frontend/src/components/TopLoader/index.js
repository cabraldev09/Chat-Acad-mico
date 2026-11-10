import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";

// A slim loading line for the top of a screen: a light streak that sweeps across, fast. It only shows when the wait is more than a
// blink (so quick answers cause no flicker) and fades away when the data is there. The slot keeps its height, so nothing moves.
const useStyles = makeStyles((theme) => ({
  slot: { position: "relative", height: 3, flex: "none", overflow: "hidden" },
  line: {
    position: "absolute", inset: 0, opacity: 0, transition: "opacity .25s ease",
    background: theme.palette.type === "dark" ? "rgba(255,255,255,.06)" : "rgba(6,147,227,.10)",
    "&::after": {
      content: '""', position: "absolute", top: 0, bottom: 0, left: 0, width: "38%", borderRadius: 3,
      background: "linear-gradient(90deg, rgba(6,147,227,0) 0%, #0693E3 35%, #0B4279 65%, rgba(11,66,121,0) 100%)",
      animation: "$sweep .85s cubic-bezier(.45,.05,.35,1) infinite",
      willChange: "transform",
    },
    "@media (prefers-reduced-motion: reduce)": { "&::after": { animation: "$pulse 1.2s ease-in-out infinite", width: "100%" } },
  },
  on: { opacity: 1 },
  "@keyframes sweep": { "0%": { transform: "translateX(-110%)" }, "100%": { transform: "translateX(290%)" } },
  "@keyframes pulse": { "0%, 100%": { opacity: 0.35 }, "50%": { opacity: 1 } },
}));

const TopLoader = ({ active, delay = 120 }) => {
  const classes = useStyles();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) { setShown(false); return undefined; }
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [active, delay]);
  return (
    <div className={classes.slot} role="progressbar" aria-hidden={!shown} aria-busy={!!active}>
      <div className={`${classes.line} ${shown ? classes.on : ""}`} />
    </div>
  );
};

export default TopLoader;
