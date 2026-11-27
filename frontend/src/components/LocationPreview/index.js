import React, { useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { MapPin } from "lucide-react";

// A shared location, as on WhatsApp: the map fills the bubble (its space is kept while it loads), the name or address under it,
// and a click opens the map. With nothing written, the time of the message goes over the map.
const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  return {
    root: { width: "100%" },
    map: {
      position: "relative", display: "block", width: "100%", aspectRatio: "2 / 1", minHeight: 0, padding: 0, border: 0, borderRadius: 6, overflow: "hidden",
      cursor: "pointer", background: dark ? "rgba(255,255,255,.06)" : "rgba(11,20,26,.06)",
      "&[disabled]": { cursor: "default" },
      "& img": { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" },
    },
    pin: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)", color: "#e5453a", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" },
    desc: { padding: "6px 6px 0", fontSize: 14.5, lineHeight: "20px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  };
});

const LocationPreview = ({ image, link, description, overlay, meta }) => {
  const classes = useStyles();
  const [broken, setBroken] = useState(false);
  const open = () => {
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  };
  const text = description ? String(description).replace(/\\n/g, "\n") : "";
  return (
    <div className={classes.root}>
      <button type="button" className={classes.map} onClick={open} disabled={!link} aria-label="Abrir a localização no mapa" title="Abrir no mapa">
        {image && !broken && <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />}
        {(!image || broken) && <MapPin size={34} weight="fill" className={classes.pin} aria-hidden="true" />}
        {!text && overlay}
      </button>
      {text && (
        <div className={classes.desc}>
          {text}
          {meta}
          <div style={{ clear: "both" }} />
        </div>
      )}
    </div>
  );
};

export default LocationPreview;
