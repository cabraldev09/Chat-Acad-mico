import React, { useEffect, useState } from "react";
import { Button, CircularProgress, MenuItem, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import toastError from "../../errors/toastError";

// ---------------------------------------------------------------- pace of the sending
// Three ready paces instead of four raw numbers; the numbers stay under "Avançado" for whoever wants them.
export const PACES = {
  safe: { label: "Seguro", hint: "1 mensagem a cada 40–90 s, pausa de 10 min a cada 15. Indicado para conexão por QR Code.", intervalMin: 40, intervalMax: 90, batchSize: 15, batchPause: 600 },
  normal: { label: "Normal", hint: "1 mensagem a cada 20–60 s, pausa de 5 min a cada 20.", intervalMin: 20, intervalMax: 60, batchSize: 20, batchPause: 300 },
  fast: { label: "Rápido", hint: "1 mensagem a cada 5–15 s, pausa de 2 min a cada 50. Só para a API oficial.", intervalMin: 5, intervalMax: 15, batchSize: 50, batchPause: 120 },
};
export const paceOf = (v) => {
  const found = Object.entries(PACES).find(([, p]) => p.intervalMin === Number(v.intervalMin) && p.intervalMax === Number(v.intervalMax) && p.batchSize === Number(v.batchSize) && p.batchPause === Number(v.batchPause));
  return { key: found ? found[0] : "custom", intervalMin: Number(v.intervalMin ?? 20), intervalMax: Number(v.intervalMax ?? 60), batchSize: Number(v.batchSize ?? 20), batchPause: Number(v.batchPause ?? 300) };
};

const choice = (on) => ({
  flex: "1 1 120px", textAlign: "left", cursor: "pointer", font: "inherit", color: "var(--text-1)", padding: "10px 12px", borderRadius: 10,
  border: `1px solid ${on ? "#0f766e" : "var(--line-strong)"}`, background: on ? "rgba(15,118,110,.08)" : "var(--surface)", boxShadow: on ? "0 0 0 1px #0f766e" : "none",
});

export const PacePicker = ({ value, setValue }) => {
  const pace = value || paceOf({});
  const [advanced, setAdvanced] = useState(pace.key === "custom");
  const pick = (key) => setValue({ key, ...PACES[key] });
  const num = (k, label) => (
    <TextField size="small" variant="outlined" type="number" label={label} value={pace[k]} onChange={(e) => setValue({ ...pace, key: "custom", [k]: Number(e.target.value) })} style={{ flex: "1 1 140px" }} />
  );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Typography variant="subtitle2">Ritmo de envio</Typography>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(PACES).map(([key, p]) => (
          <button key={key} type="button" onClick={() => pick(key)} style={choice(pace.key === key)} aria-pressed={pace.key === key}>
            <div style={{ fontWeight: 700 }}>{p.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>{p.hint}</div>
          </button>
        ))}
      </div>
      <div>
        <Button size="small" onClick={() => setAdvanced((a) => !a)} style={{ textTransform: "none" }}>{advanced ? "Ocultar avançado" : "Avançado"}{pace.key === "custom" ? " (personalizado)" : ""}</Button>
      </div>
      {advanced && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {num("intervalMin", "Intervalo mínimo (s)")}
          {num("intervalMax", "Intervalo máximo (s)")}
          {num("batchSize", "Pausar a cada N mensagens")}
          {num("batchPause", "Duração da pausa (s)")}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- approved template of the official API
const VAR_LABEL = { primeiro_nome: "Primeiro nome", nome: "Nome completo", curso: "Curso de interesse", polo: "Polo", consultor: "Consultor", numero: "Número" };
const DEFAULT_PARAMS = ["primeiro_nome", "consultor", "curso", "polo"];

// value: { name, language, body, params: [variable for {{1}}, {{2}}…] }
export const TemplatePicker = ({ whatsappId, value, setValue }) => {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!whatsappId) return;
    setList(null); setError("");
    api.get("/campaigns/templates", { params: { whatsappId } })
      .then(({ data }) => setList(data.templates || []))
      .catch((err) => { setList([]); setError("Não foi possível ler os modelos da Meta agora. Você ainda pode digitar o nome do modelo."); toastError(err); });
  }, [whatsappId]);
  const current = value || { name: "", language: "pt_BR", body: "", params: [] };
  const chosen = (list || []).find((t) => t.name === current.name && t.language === current.language);
  const choose = (key) => {
    const [name, language] = key.split("|");
    const t = (list || []).find((x) => x.name === name && x.language === language);
    if (!t) return setValue({ name: "", language: "pt_BR", body: "", params: [] });
    setValue({ name: t.name, language: t.language, body: t.body, params: Array.from({ length: t.params }, (_, i) => current.params[i] || DEFAULT_PARAMS[i] || "primeiro_nome") });
  };
  const preview = (current.body || "").replace(/\{\{(\d+)\}\}/g, (_m, n) => `[${VAR_LABEL[current.params[Number(n) - 1]] || "?"}]`);
  return (
    <div style={{ display: "grid", gap: 10, border: "1px solid var(--line-strong)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
      <Typography variant="subtitle2">Modelo aprovado (API oficial)</Typography>
      <Typography variant="caption" color="textSecondary">Para falar com quem não escreveu nas últimas 24 h, a Meta exige um modelo aprovado. Só a primeira mensagem sai; o resto da conversa continua quando a pessoa responder.</Typography>
      {list === null ? <CircularProgress size={18} /> : list.length ? (
        <TextField select size="small" variant="outlined" label="Modelo" value={chosen ? `${chosen.name}|${chosen.language}` : ""} onChange={(e) => choose(e.target.value)}>
          <MenuItem value="">Sem modelo (só para quem conversou nas últimas 24 h)</MenuItem>
          {list.map((t) => <MenuItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language} · {t.category === "MARKETING" ? "Marketing" : t.category === "UTILITY" ? "Utilidade" : t.category}</MenuItem>)}
        </TextField>
      ) : (
        <>
          {error && <Typography variant="caption" style={{ color: "#b45309" }}>{error}</Typography>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TextField size="small" variant="outlined" label="Nome do modelo" value={current.name} onChange={(e) => setValue({ ...current, name: e.target.value })} style={{ flex: "2 1 200px" }} />
            <TextField size="small" variant="outlined" label="Idioma" value={current.language} onChange={(e) => setValue({ ...current, language: e.target.value })} style={{ flex: "1 1 100px" }} />
          </div>
        </>
      )}
      {current.body && (
        <>
          {current.params.map((p, i) => (
            <TextField key={i} select size="small" variant="outlined" label={`{{${i + 1}}} recebe`} value={p} onChange={(e) => setValue({ ...current, params: current.params.map((x, j) => (j === i ? e.target.value : x)) })}>
              {Object.entries(VAR_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            </TextField>
          ))}
          <div style={{ background: "#dcf8c6", color: "#111", borderRadius: 10, padding: "10px 12px", whiteSpace: "pre-wrap", fontSize: 13.5, border: "1px solid rgba(0,0,0,.08)", maxWidth: 420 }}>{preview}</div>
        </>
      )}
    </div>
  );
};
