import React from "react";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles((theme) => ({
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 30,
    padding: "0 12px 0 10px",
    borderRadius: theme.borderRadius.pill,
    border: theme.border.divider,
    background: theme.palette.cards.background,
    color: theme.palette.text.primary,
    fontSize: 13,
    fontWeight: 500,
    transition: "border-color .2s, box-shadow .2s",
    "&:hover": { borderColor: theme.palette.accent.main },
    "& .ico": { fontSize: 15 },
  },
  dot: { width: 8, height: 8, borderRadius: "50%", flex: "none" },
}));

const COLORS = { ok: "#16a34a", wait: "#f59e0b", off: "#dc2626" };

// tone: ok | wait | off
const StatusPill = ({ tone = "ok", icon, children, title }) => {
  const classes = useStyles();
  return (
    <span className={classes.pill} title={title}>
      <span
        className={`${classes.dot} ${tone === "off" ? "live-dot warn" : tone === "ok" ? "" : ""}`}
        style={tone === "off" ? undefined : { background: COLORS[tone], boxShadow: `0 0 0 3px ${COLORS[tone]}22` }}
      />
      {icon}
      {children}
    </span>
  );
};

export default StatusPill;
