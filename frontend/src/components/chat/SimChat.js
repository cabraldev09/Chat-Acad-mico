import React from "react";
import { makeStyles } from "@material-ui/core/styles";

import { wa } from "./chatTheme";

// The look of every simulator (testing a flow, the old menu, the AI agent): the conversation as WhatsApp shows it, in the light and the dark
// theme, with the bubbles of the person and of the robot, the notes of the system in the middle and "digitando…" while the robot thinks.
// Only the look: each simulator keeps its own logic.
export const useSimChat = makeStyles((theme) => {
  const w = wa(theme);
  const bubble = { maxWidth: "82%", padding: "7px 10px 8px", fontSize: 14, lineHeight: 1.42, whiteSpace: "pre-wrap", overflowWrap: "anywhere", boxShadow: w.shadow || "0 1px 0.5px rgba(11,20,26,.13)", animation: "pop-in .18s ease-out both" };
  return {
    chat: { background: w.wallpaper, borderRadius: "var(--radius-card)", border: "1px solid var(--line)", padding: theme.spacing(1.5), overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, ...theme.scrollbarStyles },
    me: { ...bubble, alignSelf: "flex-end", background: w.bubbleOutBg, color: w.bubbleOutText, borderRadius: "10px 10px 3px 10px" },
    bot: { ...bubble, alignSelf: "flex-start", background: w.bubbleIn, color: w.text, borderRadius: "10px 10px 10px 3px" },
    sys: { alignSelf: "center", maxWidth: "90%", fontSize: 12, lineHeight: 1.4, textAlign: "center", padding: "4px 12px", borderRadius: 8, background: w.chatChip, color: w.textSecondary, boxShadow: w.shadow || "none" },
    meta: { alignSelf: "flex-start", fontSize: 11.5, color: w.textSecondary, margin: "-2px 6px 2px" },
    option: { border: 0, background: w.bubbleIn, color: w.accent, fontWeight: 600, fontFamily: "inherit", fontSize: 13.5, padding: "8px 10px", borderRadius: 10, cursor: "pointer", boxShadow: w.shadow || "none", textAlign: "center", "&:hover": { filter: "brightness(.97)" }, "&:disabled": { opacity: 0.6, cursor: "default" } },
    typing: { alignSelf: "flex-start", background: w.bubbleIn, borderRadius: "10px 10px 10px 3px", padding: "10px 12px", display: "inline-flex", gap: 4, boxShadow: w.shadow || "none" },
    dot: { width: 6, height: 6, borderRadius: "50%", background: w.textSecondary, opacity: 0.5, animation: "$blink 1.2s infinite ease-in-out", "&:nth-child(2)": { animationDelay: ".15s" }, "&:nth-child(3)": { animationDelay: ".3s" }, "@media (prefers-reduced-motion: reduce)": { animation: "none" } },
    "@keyframes blink": { "0%, 80%, 100%": { opacity: 0.25, transform: "translateY(0)" }, "40%": { opacity: 0.9, transform: "translateY(-2px)" } },
    composer: { display: "flex", gap: 8, alignItems: "center", marginTop: theme.spacing(1.25), flexWrap: "wrap", "& .MuiButton-root": { whiteSpace: "nowrap", flex: "none" } },
  };
});

// "digitando…": three dots in a bubble of the robot
export const Typing = () => {
  const c = useSimChat();
  return (
    <span className={c.typing} role="status" aria-label="Digitando">
      <span className={c.dot} /><span className={c.dot} /><span className={c.dot} />
    </span>
  );
};
