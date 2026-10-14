import React, { useState } from "react";
import Popover from "@material-ui/core/Popover";
import { makeStyles } from "@material-ui/core/styles";
import { Picker } from "emoji-mart";
import "emoji-mart/css/emoji-mart.css";
import { Plus, Smile } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { REACTIONS } from "../MessageOptionsMenu";

// The smiley that appears beside a message on hover: pick a reaction like on WhatsApp Web
// (the usual six, and "+" for any emoji). Choosing the one you already gave removes it.
const useStyles = makeStyles(() => ({
  bar: { display: "flex", alignItems: "center", gap: 2, padding: "4px 8px", borderRadius: 999 },
  emoji: {
    width: 38, height: 38, fontSize: 24, lineHeight: "38px", textAlign: "center", border: 0, borderRadius: "50%", background: "transparent", cursor: "pointer",
    transition: "transform .12s, background-color .12s", "&:hover": { transform: "scale(1.25)", backgroundColor: "rgba(127,127,127,.15)" },
  },
  on: { backgroundColor: "rgba(0,168,132,.2)" },
  more: { width: 34, height: 34, border: 0, borderRadius: "50%", background: "rgba(127,127,127,.15)", cursor: "pointer", display: "grid", placeItems: "center", color: "inherit" },
}));

const ReactionBar = ({ message, channel = "whatsapp", className }) => {
  const classes = useStyles();
  const [anchor, setAnchor] = useState(null);
  const [full, setFull] = useState(false);
  const palette = REACTIONS[channel] || REACTIONS.whatsapp;

  let mine = null;
  try {
    mine = (message.reactions ? JSON.parse(message.reactions) : []).find((r) => r.fromMe)?.emoji || null;
  } catch (e) {
    mine = null;
  }

  const close = () => {
    setAnchor(null);
    setFull(false);
  };
  const react = async (emoji) => {
    close();
    try {
      await api.post(`/messages/${message.id}/react`, { emoji: mine === emoji ? "" : emoji });
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <>
      <button type="button" className={className} title="Reagir" aria-label="Reagir à mensagem" onClick={(e) => setAnchor(e.currentTarget)}>
        <Smile size={17} />
      </button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        PaperProps={{ style: { borderRadius: full ? 12 : 999, overflow: "hidden" } }}
      >
        {full ? (
          <Picker native perLine={8} emojiSize={24} emojiButtonSize={36} showPreview={false} showSkinTones={false} title="" onSelect={(e) => react(e.native)} />
        ) : (
          <div className={classes.bar}>
            {palette.map((e) => (
              <button key={e} type="button" className={`${classes.emoji} ${mine === e ? classes.on : ""}`} onClick={() => react(e)}>
                {e}
              </button>
            ))}
            {channel === "whatsapp" && (
              <button type="button" className={classes.more} title="Mais emojis" onClick={() => setFull(true)}>
                <Plus size={18} />
              </button>
            )}
          </div>
        )}
      </Popover>
    </>
  );
};

export default ReactionBar;
