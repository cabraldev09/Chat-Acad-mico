import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, MenuItem, TextField, Typography, makeStyles } from "@material-ui/core";
import { Code2, Copy, ExternalLink } from "lucide-react";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => {
  const line = theme.palette.type === "dark" ? "rgba(255,255,255,.09)" : "#e3e9f1";
  return {
    card: { background: theme.palette.cards.background, border: `1px solid ${line}`, borderRadius: 16, padding: theme.spacing(2.25), marginBottom: theme.spacing(2) },
    hint: { fontSize: 13, color: theme.palette.text.secondary },
    row: { display: "flex", gap: theme.spacing(1.25), flexWrap: "wrap", alignItems: "center" },
    item: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap" },
    code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, background: theme.palette.action.hover, borderRadius: 8, padding: theme.spacing(1), wordBreak: "break-all", marginTop: 8 },
  };
});

const slugify = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const copy = (text, ok) => { try { navigator.clipboard.writeText(text); toast.success(ok); } catch (e) { toast.error("Não foi possível copiar."); } };

// The public page of each course: the link to put in the site, in the ads and in the bio, with the origin already marked
// (UTM), so the leads that come from it show up in the cost per source.
const CoursePages = () => {
  const classes = useStyles();
  const [courses, setCourses] = useState(null);
  const [search, setSearch] = useState("");
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" });
  const [code, setCode] = useState(null);

  useEffect(() => {
    api.get("/courses", { params: { pageNumber: 1, searchParam: "", active: true } })
      .then(({ data }) => setCourses((Array.isArray(data) ? data : data.courses || data.rows || []).filter((c) => c.active !== false)))
      .catch((e) => { setCourses([]); toastError(e); });
  }, []);

  const base = window.location.origin;
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (utm.source) p.set("utm_source", utm.source);
    if (utm.medium) p.set("utm_medium", utm.medium);
    if (utm.campaign) p.set("utm_campaign", utm.campaign);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [utm]);
  const urlOf = (c, embed) => `${base}/curso/${c.id}-${slugify(c.name)}${query}${embed ? `${query ? "&" : "?"}embed=1` : ""}`;

  if (!courses) return null;
  const q = search.trim().toLowerCase();
  const shown = courses.filter((c) => !q || String(c.name).toLowerCase().includes(q)).slice(0, 60);
  return (
    <div>
      <div className={classes.card}>
        <Typography style={{ fontWeight: 600 }}>Origem do link</Typography>
        <Typography className={classes.hint} gutterBottom>Preencha para marcar de onde vem quem abrir o link. O lead chega no CRM com essa origem. Ex.: origem “google”, meio “cpc”, campanha “vestibular-2026”.</Typography>
        <div className={classes.row}>
          <TextField size="small" variant="outlined" label="Origem (utm_source)" value={utm.source} onChange={(e) => setUtm({ ...utm, source: e.target.value.trim() })} style={{ width: 200 }} />
          <TextField size="small" variant="outlined" label="Meio (utm_medium)" value={utm.medium} onChange={(e) => setUtm({ ...utm, medium: e.target.value.trim() })} style={{ width: 200 }} />
          <TextField size="small" variant="outlined" label="Campanha (utm_campaign)" value={utm.campaign} onChange={(e) => setUtm({ ...utm, campaign: e.target.value.trim() })} style={{ width: 240 }} />
        </div>
      </div>

      <div className={classes.card}>
        <div className={classes.row} style={{ marginBottom: 6 }}>
          <Typography style={{ fontWeight: 600, flex: 1 }}>Páginas dos cursos ({courses.length})</Typography>
          <TextField size="small" variant="outlined" label="Buscar curso" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        </div>
        <Typography className={classes.hint}>A página mostra o curso (sem valores) e um formulário. Quem preencher vira lead já ligado ao curso.</Typography>
        {shown.map((c) => (
          <div key={c.id} className={classes.item}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className={classes.hint}>{[c.modality, c.category].filter(Boolean).join(" · ")}</div>
            </div>
            <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={() => copy(urlOf(c), "Link copiado.")}>Copiar link</Button>
            <Button size="small" startIcon={<Code2 size={14} />} onClick={() => setCode(code === c.id ? null : c.id)}>Incorporar no site</Button>
            <Button size="small" startIcon={<ExternalLink size={14} />} component="a" href={urlOf(c)} target="_blank" rel="noopener noreferrer">Abrir</Button>
            {code === c.id && (
              <div style={{ width: "100%" }}>
                <div className={classes.code}>{`<iframe src="${urlOf(c, true)}" width="100%" height="640" style="border:0" title="${c.name}"></iframe>`}</div>
                <Button size="small" style={{ marginTop: 6 }} startIcon={<Copy size={14} />} onClick={() => copy(`<iframe src="${urlOf(c, true)}" width="100%" height="640" style="border:0" title="${c.name}"></iframe>`, "Código copiado.")}>Copiar código</Button>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && <Typography className={classes.hint} style={{ marginTop: 10 }}>Nenhum curso encontrado.</Typography>}
      </div>
    </div>
  );
};

export default CoursePages;
