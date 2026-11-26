import React, { useState } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, Radio, RadioGroup, Switch, TextField, Typography } from "@material-ui/core";

import api from "../../services/api";
import { CurrencyField } from "../../components/MaskedFields";
import toastError from "../../errors/toastError";

// THE OFFER OF A RECOVERY CAMPAIGN (only the management): the monthly fee (a fixed value or a scholarship over the price of each person's
// course), the enrollment fee or exempt, the start, until when it holds, and what happens when the person answers. Before saving, the
// values person by person and "Revisei a oferta".
export const emptyOffer = () => ({ enabled: false, monthlyMode: "bolsa", monthly: "", bolsaPct: "", enrollmentExempt: false, enrollmentFee: "", startDate: "", validUntil: "", approach: "ia", reviewed: false });

export const offerIn = (row) => {
  let o = null;
  try { o = row.offer ? JSON.parse(row.offer) : null; } catch (e) { o = null; }
  if (!o) return emptyOffer();
  return { ...emptyOffer(), ...o, enabled: true, monthly: o.monthly ?? "", bolsaPct: o.bolsaPct ?? "", enrollmentFee: o.enrollmentFee ?? "", startDate: o.startDate || "", approach: row.approach || "ia", reviewed: false };
};

// what goes to the server: nothing when it is off (a consultant never sends the field), the offer and the approach when it is on
export const offerOut = (v, manager) => {
  if (!manager) return {};
  if (!v || !v.enabled) return { offer: null };
  const { enabled, reviewed, approach, ...offer } = v;
  return { offer, approach, offerReviewed: !!reviewed };
};

const APPROACHES = [
  ["ia", "A IA do número oficial conversa com a oferta e passa ao consultor para fechar"],
  ["proposta", "O sistema gera a proposta com a oferta e envia (precisa da data de início)"],
  ["consultor", "O consultor responsável retoma a conversa"],
];

const OfferEditor = ({ value, setValue, contactListId }) => {
  const v = value || emptyOffer();
  const set = (patch) => setValue({ ...v, ...patch, reviewed: false });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const look = async () => {
    setLoading(true);
    try {
      const { enabled, reviewed, approach, ...offer } = v;
      const { data } = await api.post("/campaigns/offer-preview", { contactListId, offer });
      setPreview(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };
  const row = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" };
  return (
    <div style={{ display: "grid", gap: 12, border: "1px solid var(--line-strong)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
      <FormControlLabel control={<Switch color="primary" checked={!!v.enabled} onChange={(e) => setValue({ ...v, enabled: e.target.checked, reviewed: false })} />} label="Campanha de recuperação com oferta" />
      {!v.enabled ? (
        <Typography variant="caption" color="textSecondary">Ligue para recuperar leads que pararam ou desistiram: você define a condição, revisa o valor de cada pessoa e escolhe o que acontece quando ela responder.</Typography>
      ) : (
        <>
          <div style={row}>
            <TextField select size="small" variant="outlined" label="Mensalidade" value={v.monthlyMode} onChange={(e) => set({ monthlyMode: e.target.value })} style={{ flex: "1 1 220px" }}>
              <MenuItem value="bolsa">Bolsa sobre o preço do curso de cada pessoa</MenuItem>
              <MenuItem value="fixo">Valor fixo para todos</MenuItem>
            </TextField>
            {v.monthlyMode === "bolsa"
              ? <TextField size="small" variant="outlined" label="Bolsa (%)" value={v.bolsaPct} onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 2); set({ bolsaPct: d }); }} inputProps={{ inputMode: "numeric", maxLength: 2 }} helperText="De 1% a 99%" style={{ flex: "1 1 140px" }} />
              : <CurrencyField size="small" variant="outlined" label="Mensalidade (R$)" value={v.monthly === "" ? null : Number(v.monthly)} onChange={(n) => set({ monthly: n === null ? "" : n })} style={{ flex: "1 1 140px" }} />}
          </div>
          <div style={row}>
            <FormControlLabel control={<Checkbox color="primary" checked={!!v.enrollmentExempt} onChange={(e) => set({ enrollmentExempt: e.target.checked })} />} label="Taxa de matrícula isenta" style={{ flex: "1 1 200px" }} />
            {!v.enrollmentExempt && <CurrencyField size="small" variant="outlined" label="Taxa de matrícula (R$)" value={v.enrollmentFee === "" ? null : Number(v.enrollmentFee)} onChange={(n) => set({ enrollmentFee: n === null ? "" : n })} style={{ flex: "1 1 160px" }} />}
          </div>
          <div style={row}>
            <TextField size="small" variant="outlined" type="date" label="Início (1º vencimento)" InputLabelProps={{ shrink: true }} value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} style={{ flex: "1 1 160px" }} />
            <TextField size="small" variant="outlined" type="date" label="A oferta vale até" InputLabelProps={{ shrink: true }} value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} style={{ flex: "1 1 160px" }} required />
          </div>
          <div>
            <Typography variant="subtitle2">Quando a pessoa responder</Typography>
            <RadioGroup value={v.approach} onChange={(e) => set({ approach: e.target.value })}>
              {APPROACHES.map(([k, label]) => <FormControlLabel key={k} value={k} control={<Radio color="primary" size="small" />} label={label} />)}
            </RadioGroup>
            <Typography variant="caption" color="textSecondary">
              Use um modelo de Utilidade já aprovado (por exemplo, solicitacao_em_aberto ou proposta_pronta), sem valores: ele só retoma o contato, e a oferta
              vai quando a pessoa responder (a IA diz a oferta na primeira resposta, o sistema manda a oferta antes do consultor, ou envia a proposta). Valores
              no modelo só num modelo de Marketing aprovado. A IA só diz os valores desta oferta; qualquer outro continua bloqueado.
            </Typography>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <Button variant="outlined" size="small" onClick={look} disabled={loading || !contactListId} style={{ justifySelf: "start" }}>{loading ? "Calculando…" : "Ver o valor de cada pessoa"}</Button>
            {!contactListId && <Typography variant="caption" color="textSecondary">Escolha a lista no primeiro passo para ver os valores.</Typography>}
            {preview && (
              <div style={{ overflowX: "auto" }}>
                <Typography variant="caption" color="textSecondary">
                  {preview.total} {preview.total === 1 ? "pessoa" : "pessoas"}{preview.noPrice ? `; ${preview.noPrice} sem curso com preço (o consultor informa o valor)` : ""}. Mostrando até 50.
                </Typography>
                <table className="pk-table" style={{ width: "100%", marginTop: 6 }}>
                  <thead><tr><th>Pessoa</th><th>Curso</th><th className="r">Mensalidade</th><th className="r">Taxa</th></tr></thead>
                  <tbody>{preview.rows.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.course || "—"}</td><td className="r">{r.monthly}</td><td className="r">{r.fee}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <FormControlLabel control={<Checkbox color="primary" checked={!!v.reviewed} onChange={(e) => setValue({ ...v, reviewed: e.target.checked })} />} label="Revisei a oferta e o valor de cada pessoa" />
          </div>
        </>
      )}
    </div>
  );
};

export default OfferEditor;
