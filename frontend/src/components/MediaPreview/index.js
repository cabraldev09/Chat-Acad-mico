import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import InputBase from "@material-ui/core/InputBase";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import CircularProgress from "@material-ui/core/CircularProgress";
import Close from "@material-ui/icons/Close";
import Send from "@material-ui/icons/Send";
import Add from "@material-ui/icons/Add";
import Crop from "@material-ui/icons/Crop";
import RotateRight from "@material-ui/icons/RotateRight";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import InsertDriveFile from "@material-ui/icons/InsertDriveFile";

import { wa } from "../chat/chatTheme";
import { isImageFile, rotateImage } from "../../utils/imageTools";
import CropDialog from "./CropDialog";

const MAX_FILES = 10;

const useStyles = makeStyles((theme) => {
  const c = wa(theme);
  return {
    root: { display: "flex", flexDirection: "column", backgroundColor: c.wallpaper, borderTop: `1px solid ${c.divider}` },
    top: { display: "flex", alignItems: "center", gap: theme.spacing(0.5), padding: theme.spacing(1, 1.5), color: c.textSecondary },
    name: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    count: { flex: "none", fontSize: 12, color: c.textSecondary, marginRight: theme.spacing(0.5) },
    tool: { color: c.textSecondary, "&:hover": { color: c.accent, backgroundColor: c.hover } },
    stage: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, maxHeight: "min(46vh, 380px)", padding: theme.spacing(1, 2) },
    img: { maxWidth: "100%", maxHeight: "min(44vh, 360px)", borderRadius: 14, boxShadow: c.float, objectFit: "contain" },
    file: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: c.textSecondary, "& svg": { fontSize: 72 } },
    thumbs: { display: "flex", gap: 8, padding: theme.spacing(1, 1.5), overflowX: "auto" },
    thumb: {
      position: "relative",
      flex: "none",
      width: 58,
      height: 58,
      borderRadius: 12,
      overflow: "hidden",
      cursor: "pointer",
      border: "2px solid transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.panelAlt,
      color: c.textSecondary,
      transition: "border-color .15s, transform .12s",
      "& img": { width: "100%", height: "100%", objectFit: "cover" },
      "&:hover": { transform: "translateY(-1px)" },
      "&:hover $thumbX": { opacity: 1 },
    },
    thumbOn: { borderColor: c.accent },
    thumbX: {
      position: "absolute",
      top: 2,
      right: 2,
      width: 20,
      height: 20,
      padding: 0,
      borderRadius: "50%",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      backgroundColor: "rgba(11,20,40,.72)",
      opacity: 0,
      transition: "opacity .12s",
      "@media (hover: none)": { opacity: 1 },
      "& svg": { fontSize: 14 },
    },
    add: { border: `2px dashed ${c.divider}`, color: c.accent, "&:hover": { borderColor: c.accent, backgroundColor: c.hover } },
    bar: { display: "flex", alignItems: "flex-end", gap: 8, margin: theme.spacing(0.5, 2, 1.75), [theme.breakpoints.down("xs")]: { margin: theme.spacing(0.5, 1, 1) } },
    field: { flex: 1, minWidth: 0, padding: "4px 18px", borderRadius: 24, backgroundColor: c.panel, boxShadow: c.float, border: `1px solid ${c.divider}` },
    input: { fontSize: 15, color: c.text, padding: "7px 0", "& textarea": { lineHeight: "21px" } },
    send: {
      flex: "none",
      minWidth: 46,
      height: 46,
      padding: "0 16px",
      borderRadius: 23,
      border: "none",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      fontFamily: "inherit",
      fontSize: 14,
      fontWeight: 700,
      color: "#fff",
      background: c.accent,
      boxShadow: "0 3px 10px rgba(0,168,132,.35)",
      transition: "transform .12s, filter .15s",
      "&:hover": { filter: "brightness(1.08)" },
      "&:active": { transform: "scale(.96)" },
      "&:disabled": { opacity: 0.55, cursor: "default" },
    },
  };
});

// Preview of the files about to be sent: several at once, a caption for each, crop and rotate for pictures.
const MediaPreview = ({ medias, setMedias, captions, setCaptions, current, setCurrent, loading, onSend, onClose, onAdd }) => {
  const classes = useStyles();
  const addInput = useRef();
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);

  const urls = useMemo(() => medias.map((m) => (isImageFile(m) ? URL.createObjectURL(m) : null)), [medias]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  const index = Math.min(current, medias.length - 1);
  const file = medias[index];
  if (!file) return null;

  const replaceCurrent = (next) => setMedias((list) => list.map((m, i) => (i === index ? next : m)));

  const remove = (i) => {
    if (medias.length === 1) return onClose();
    setMedias((list) => list.filter((_, k) => k !== i));
    setCaptions((list) => list.filter((_, k) => k !== i));
    setCurrent((cur) => Math.max(0, i < cur || cur === medias.length - 1 ? cur - 1 : cur));
    return undefined;
  };

  const rotate = async () => {
    setBusy(true);
    try {
      replaceCurrent(await rotateImage(file, 90));
    } catch (err) {
      toast.error("Não foi possível girar a imagem.");
    }
    setBusy(false);
  };

  return (
    <div className={classes.root}>
      <div className={classes.top}>
        <Tooltip title="Cancelar envio">
          <IconButton className={classes.tool} onClick={onClose} aria-label="Cancelar envio"><Close /></IconButton>
        </Tooltip>
        <span className={classes.name}>{file.name}</span>
        {medias.length > 1 && <span className={classes.count}>{index + 1} de {medias.length}</span>}
        {isImageFile(file) && (
          <>
            <Tooltip title="Recortar">
              <span><IconButton className={classes.tool} onClick={() => setCropping(true)} disabled={busy} aria-label="Recortar imagem"><Crop /></IconButton></span>
            </Tooltip>
            <Tooltip title="Girar 90°">
              <span><IconButton className={classes.tool} onClick={rotate} disabled={busy} aria-label="Girar imagem"><RotateRight /></IconButton></span>
            </Tooltip>
          </>
        )}
        <Tooltip title="Tirar este arquivo do envio">
          <IconButton className={classes.tool} onClick={() => remove(index)} aria-label="Remover arquivo"><DeleteOutline /></IconButton>
        </Tooltip>
      </div>

      <div className={classes.stage}>
        {urls[index] ? (
          <img className={classes.img} src={urls[index]} alt={file.name} />
        ) : (
          <div className={classes.file}>
            <InsertDriveFile />
            <span>{file.name}</span>
            <span style={{ fontSize: 12 }}>{(file.size / 1024).toFixed(0)} KB · sem pré-visualização</span>
          </div>
        )}
      </div>

      <div className={classes.thumbs}>
        {medias.map((m, i) => (
          <div key={`${m.name}-${m.size}-${i}`} className={`${classes.thumb} ${i === index ? classes.thumbOn : ""}`} onClick={() => setCurrent(i)}>
            {urls[i] ? <img src={urls[i]} alt="" /> : <InsertDriveFile />}
            {medias.length > 1 && (
              <button type="button" className={classes.thumbX} aria-label="Remover" onClick={(e) => { e.stopPropagation(); remove(i); }}>
                <Close />
              </button>
            )}
          </div>
        ))}
        {medias.length < MAX_FILES && (
          <Tooltip title="Adicionar mais arquivos">
            <div className={`${classes.thumb} ${classes.add}`} onClick={() => addInput.current && addInput.current.click()} role="button" aria-label="Adicionar mais arquivos">
              <Add />
            </div>
          </Tooltip>
        )}
        <input ref={addInput} type="file" multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      </div>

      <div className={classes.bar}>
        <div className={classes.field}>
          <InputBase
            fullWidth
            autoFocus
            multiline
            maxRows={4}
            className={classes.input}
            placeholder={medias.length > 1 ? "Legenda desta imagem (opcional)" : "Adicione uma legenda (opcional)"}
            value={captions[index] || ""}
            onChange={(e) => setCaptions((cs) => cs.map((c2, i) => (i === index ? e.target.value : c2)))}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !loading) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        </div>
        <button type="button" className={classes.send} onClick={onSend} disabled={loading || busy} aria-label="Enviar">
          {loading ? <CircularProgress size={20} color="inherit" /> : <Send style={{ fontSize: 20 }} />}
          {medias.length > 1 && !loading && <span>Enviar {medias.length}</span>}
        </button>
      </div>

      <CropDialog file={file} open={cropping} onClose={() => setCropping(false)} onApply={(next) => { replaceCurrent(next); setCropping(false); }} />
    </div>
  );
};

export default MediaPreview;
