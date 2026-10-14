import React, { useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Dialog, Button, IconButton, Slider, CircularProgress } from "@material-ui/core";
import Close from "@material-ui/icons/Close";
import RotateLeft from "@material-ui/icons/RotateLeft";
import RotateRight from "@material-ui/icons/RotateRight";

import { cropImage, imageSize } from "../../utils/imageTools";

const PRESETS = [
  { key: "original", label: "Original" },
  { key: "1", label: "Quadrado", ratio: 1 },
  { key: "4/3", label: "4:3", ratio: 4 / 3 },
  { key: "3/4", label: "3:4", ratio: 3 / 4 },
  { key: "16/9", label: "16:9", ratio: 16 / 9 },
  { key: "9/16", label: "9:16", ratio: 9 / 16 },
];

const useStyles = makeStyles((theme) => ({
  paper: { borderRadius: 20, overflow: "hidden", backgroundColor: theme.palette.type === "dark" ? "#0f1a28" : "#fff" },
  top: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(1, 1.5, 1, 2.5) },
  title: { flex: 1, fontSize: 17, fontWeight: 700 },
  stage: { position: "relative", height: "min(56vh, 460px)", backgroundColor: "#0a1420" },
  controls: { padding: theme.spacing(2, 2.5, 1) },
  row: { display: "flex", alignItems: "center", gap: theme.spacing(1.5), marginBottom: theme.spacing(1.25) },
  label: { width: 64, flex: "none", fontSize: 13, color: theme.palette.text.secondary },
  chips: { display: "flex", flexWrap: "wrap", gap: theme.spacing(0.75) },
  chip: {
    height: 32,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
    background: "transparent",
    color: theme.palette.text.primary,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    "&:hover": { backgroundColor: theme.palette.action.hover },
  },
  chipOn: { background: "#00a884", borderColor: "#00a884", color: "#fff", "&:hover": { backgroundColor: "#00a884" } },
  actions: { display: "flex", justifyContent: "flex-end", gap: theme.spacing(1), padding: theme.spacing(1, 2.5, 2) },
}));

// Crop, zoom and rotate a picture before sending it.
const CropDialog = ({ file, open, onClose, onApply }) => {
  const classes = useStyles();
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [preset, setPreset] = useState("original");
  const [natural, setNatural] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !file) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setPreset("original");
    setArea(null);
    imageSize(file).then((s) => setNatural(s.width / s.height)).catch(() => setNatural(1));
  }, [open, file]);

  const turned = Math.abs(rotation / 90) % 2 === 1;
  const ratio = preset === "original" ? (turned ? 1 / natural : natural) : PRESETS.find((p) => p.key === preset).ratio;

  const apply = async () => {
    if (!area) return;
    setBusy(true);
    try {
      onApply(await cropImage(file, area, rotation));
    } catch (err) {
      toast.error(err.message || "Não foi possível recortar a imagem.");
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" PaperProps={{ className: classes.paper }}>
      <div className={classes.top}>
        <div className={classes.title}>Recortar imagem</div>
        <IconButton onClick={onClose} disabled={busy} aria-label="Fechar"><Close /></IconButton>
      </div>
      <div className={classes.stage}>
        {url && (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={ratio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, pixels) => setArea(pixels)}
            showGrid
            zoomSpeed={0.2}
          />
        )}
      </div>
      <div className={classes.controls}>
        <div className={classes.row}>
          <span className={classes.label}>Formato</span>
          <div className={classes.chips}>
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className={`${classes.chip} ${preset === p.key ? classes.chipOn : ""}`} onClick={() => { setPreset(p.key); setCrop({ x: 0, y: 0 }); }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className={classes.row}>
          <span className={classes.label}>Zoom</span>
          <Slider value={zoom} min={1} max={4} step={0.02} onChange={(_, v) => setZoom(v)} aria-label="Zoom" />
        </div>
        <div className={classes.row}>
          <span className={classes.label}>Girar</span>
          <IconButton size="small" onClick={() => setRotation((r) => (r - 90) % 360)} aria-label="Girar para a esquerda"><RotateLeft /></IconButton>
          <Slider value={rotation} min={-180} max={180} step={1} onChange={(_, v) => setRotation(v)} aria-label="Ângulo" />
          <IconButton size="small" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Girar para a direita"><RotateRight /></IconButton>
        </div>
      </div>
      <div className={classes.actions}>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" color="primary" onClick={apply} disabled={busy || !area}>
          {busy ? <CircularProgress size={18} color="inherit" /> : "Aplicar recorte"}
        </Button>
      </div>
    </Dialog>
  );
};

export default CropDialog;
