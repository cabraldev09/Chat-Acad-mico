import React, { useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";

import { num, useAnalytics } from "./kit";
import { EmptyNote, GlowPanel, Person, SectionTitle, Switch } from "../peak";

// "Como você atende (leitura das conversas)": what the reading of the conversations copied from the consultant's WhatsApp said about each
// attendance (notes from 0 to 10, grade, proposal, follow-up, transfers, what to improve and why it did not convert), added up by the
// server (GET /analytics/reading-coaching). The consultant only ever gets their own; the management, the consultants it may see.

const NOTES = [
  ["tecnica", "Técnica", "Vínculo, perguntas para entender a pessoa, uma pergunta por vez, conduzir ao próximo passo"],
  ["persuasao", "Persuasão", "Valor do curso, benefícios, prova e o prazo real da turma"],
  ["negociacao", "Negociação", "Bolsa, resposta às objeções, proposta e fechamento"],
  ["ortografia", "Escrita", "Escrita correta e clara, sem abreviações"],
  ["agilidade", "Agilidade", "Rapidez nas respostas e no retorno"],
];
const RATES = [
  ["sentGrade", "Enviou a grade"],
  ["sentProposal", "Apresentou a proposta"],
  ["followUp", "Fez o retorno"],
];
const TRANSFER_RATES = [
  ["showedCompletion", "Previsão de conclusão"],
  ["showedSubjects", "Disciplinas aproveitadas"],
];

const dec = (v) => (v === null || v === undefined ? "-" : String(v).replace(".", ","));
const pctText = (r) => (!r || r.pct === null || r.pct === undefined ? "-" : `${dec(r.pct)}%`);
const noteColor = (v) => (v === null || v === undefined ? "var(--pk-line, #dfe3ea)" : v >= 7 ? "var(--pk-good, #15803d)" : v >= 5 ? "var(--pk-warn, #b45309)" : "var(--pk-bad, #dc2626)");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });

// the window of the block: the last 90 days (what the copy of the phone brings) or the period chosen on the screen
const WINDOWS = [["90", "Últimos 90 dias"], ["tela", "Período da tela"]];
const useWindow = (params) => {
  const [win, setWin] = useState("90");
  const query = useMemo(() => {
    const inst = params && params.institutionId ? { institutionId: params.institutionId } : {};
    if (win === "90" || !params) return inst;
    const from = params.from || today();
    return { ...inst, from, to: params.to || from };
  }, [win, params]);
  return { win, setWin, query };
};

const Bars = ({ notes }) => (
  <div style={{ display: "grid", gap: 10 }}>
    {NOTES.map(([k, label, hint]) => {
      const s = (notes && notes[k]) || { avg: null, n: 0 };
      return (
        <div key={k} title={hint} style={{ display: "grid", gridTemplateColumns: "minmax(78px, 110px) minmax(0, 1fr) 36px", gap: 10, alignItems: "center", fontSize: 13.5 }}>
          <span style={{ minWidth: 0 }}>{label}</span>
          <span aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "var(--track, #eef1f5)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(10, Number(s.avg) || 0)) * 10}%`, borderRadius: 999, background: noteColor(s.avg) }} />
          </span>
          <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} aria-label={s.avg === null ? `${label}: sem nota` : `${label}: ${dec(s.avg)} de 10`}>{dec(s.avg)}</b>
        </div>
      );
    })}
    <span className="pk-hint" style={{ fontSize: 12 }}>Média de 0 a 10. Verde a partir de 7, amarelo de 5 a 7, vermelho abaixo de 5.</span>
  </div>
);

const Facts = ({ c }) => {
  const rows = [
    ["Conversas lidas", num(c.read), c.evaluated < c.read ? `${num(c.evaluated)} avaliadas` : null],
    ["Matrículas", num(c.enrolled), c.conversion === null ? null : `${dec(c.conversion)}% das conversas`],
    ...RATES.map(([k, label]) => [label, pctText(c[k]), c[k] && c[k].n ? `em ${num(c[k].n)} ${c[k].n === 1 ? "conversa" : "conversas"}` : "sem evidência"]),
    ...(c.transfers ? TRANSFER_RATES.map(([k, label]) => [label, pctText(c[k]), `${num(c.transfers)} ${c.transfers === 1 ? "transferência" : "transferências"}`]) : []),
  ];
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12, margin: 0 }}>
      {rows.map(([label, value, hint]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 12.5, color: "var(--pk-ink-2, #5b6676)" }}>{label}</dt>
          <dd style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
          {hint ? <dd style={{ margin: 0, fontSize: 12, color: "var(--pk-ink-2, #5b6676)" }}>{hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
};

const LeadLinks = ({ ids }) => {
  const history = useHistory();
  if (!ids || !ids.length) return null;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {ids.map((id, i) => (
        <button key={id} type="button" className="pk-btn" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => history.push(`/crm?lead=${id}`)}>Ver exemplo {i + 1}</button>
      ))}
    </span>
  );
};

const Improve = ({ items, limit = 3 }) => (!items || !items.length ? <EmptyNote>Nenhum ponto a melhorar se repetiu nas conversas avaliadas.</EmptyNote> : (
  <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 12 }}>
    {items.slice(0, limit).map((it) => (
      <li key={it.code} style={{ minWidth: 0 }}>
        <b>{it.label}</b> <span className="pk-hint" style={{ fontSize: 12 }}>em {num(it.n)} {it.n === 1 ? "conversa" : "conversas"}</span>
        <div style={{ fontSize: 13, color: "var(--pk-ink-2, #5b6676)", marginTop: 2, overflowWrap: "anywhere" }}>{it.how}</div>
        <LeadLinks ids={it.leadIds} />
      </li>
    ))}
  </ol>
));

const WhyNot = ({ items }) => (!items || !items.length ? <EmptyNote>Todas as conversas lidas viraram matrícula.</EmptyNote> : (
  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
    {items.slice(0, 5).map((w) => (
      <li key={w.reason} style={{ minWidth: 0 }}>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><b style={{ minWidth: 0, overflowWrap: "anywhere" }}>{w.reason}</b><span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{num(w.n)}</span></span>
        {(w.examples || []).map((x) => <div key={x} style={{ fontSize: 13, color: "var(--pk-ink-2, #5b6676)", marginTop: 2, overflowWrap: "anywhere" }}>{x}</div>)}
        <LeadLinks ids={w.leadIds} />
      </li>
    ))}
  </ul>
));

// some conversations were read before the evaluation existed: they count as read, not as evaluated
const OldNote = ({ c, manager }) => (c && c.read > c.evaluated ? (
  <div className="gv-card" role="note" style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
    <span style={{ flex: 1, minWidth: 0 }}>
      {num(c.evaluated)} de {num(c.read)} conversas já avaliadas. As outras foram lidas antes da avaliação existir; use "Ler de novo" na Recuperação para avaliar as antigas{manager ? " (cada leitura gasta IA)" : ""}.
    </span>
  </div>
) : null);

// the evaluation of one person: the notes, the facts, the points to improve and why the sales did not happen
export const CoachingDetail = ({ c, manager }) => (
  <div style={{ display: "grid", gap: 16 }}>
    <OldNote c={c} manager={manager} />
    <div className="pk-grid-wide">
      <GlowPanel id="reading-notes" title="Notas do atendimento" sub={`Das ${num(c.evaluated)} conversas avaliadas.`} empty={!c.evaluated} emptyText="Nenhuma conversa avaliada ainda.">
        <Bars notes={c.notes} />
      </GlowPanel>
      <GlowPanel id="reading-facts" title="O que aparece nas conversas" sub="Só conta a conversa que mostra o ponto; sem evidência, fica de fora da conta.">
        <Facts c={c} />
      </GlowPanel>
    </div>
    <div className="pk-grid-wide">
      <GlowPanel id="reading-improve" tone="warn" title="O que melhorar primeiro" sub="Os pontos que mais se repetem, com o que fazer.">
        <Improve items={c.improve} />
      </GlowPanel>
      <GlowPanel id="reading-why" tone="bad" title="Por que não converteu" sub="Os motivos das conversas que não viraram matrícula.">
        <WhyNot items={c.whyNot} />
      </GlowPanel>
    </div>
  </div>
);

const Header = ({ title, hint, win, setWin, style }) => (
  <SectionTitle title={title} hint={hint} style={style} action={<Switch label="Período da leitura" options={WINDOWS} value={win} onChange={setWin} />} />
);

// "Meu desempenho": only the person's own (the server ignores any choice of the screen)
export const MyReadingCoaching = ({ params }) => {
  const { win, setWin, query } = useWindow(params);
  const { data, loading, error, reload } = useAnalytics("/analytics/reading-coaching", query);
  const c = data && data.consultants && data.consultants[0];
  return (
    <section style={{ marginTop: 28, minWidth: 0 }}>
      <Header title="Como você atende (leitura das conversas)" hint="A IA lê as conversas do seu WhatsApp, sem dados pessoais, e avalia cada atendimento. Só você e a gestão veem." win={win} setWin={setWin} />
      {error && !data ? <GlowPanel error onRetry={reload} />
        : loading && !data ? <GlowPanel loading />
        : !c || !c.read ? <GlowPanel><EmptyNote>Ainda não há conversas lidas.</EmptyNote></GlowPanel>
        : <div style={{ opacity: loading ? 0.75 : 1, transition: "opacity .2s ease" }}><CoachingDetail c={c} /></div>}
    </section>
  );
};

// the columns of the management table: what each one shows and how it sorts
const COLUMNS = [
  { key: "read", label: "Lidas", value: (c) => c.read, text: (c) => num(c.read) },
  { key: "conversion", label: "Conversão", value: (c) => c.conversion, text: (c) => (c.conversion === null ? "-" : `${dec(c.conversion)}%`) },
  ...NOTES.map(([k, label]) => ({ key: k, label, value: (c) => c.notes[k].avg, text: (c) => dec(c.notes[k].avg), tone: (c) => c.notes[k].avg })),
  ...RATES.map(([k, label]) => ({ key: k, label: { sentGrade: "Grade", sentProposal: "Proposta", followUp: "Retorno" }[k] || label, value: (c) => c[k].pct, text: (c) => pctText(c[k]) })),
  { key: "showedCompletion", label: "Previsão", value: (c) => (c.transfers ? c.showedCompletion.pct : null), text: (c) => (c.transfers ? pctText(c.showedCompletion) : "-") },
  { key: "showedSubjects", label: "Disciplinas", value: (c) => (c.transfers ? c.showedSubjects.pct : null), text: (c) => (c.transfers ? pctText(c.showedSubjects) : "-") },
];

// Estatísticas › Treinamento: one line per consultant, sortable; on the phone each line is a card (pk-stack). A click opens the details.
export const TeamReadingCoaching = ({ params }) => {
  const { win, setWin, query } = useWindow(params);
  const { data, loading, error, reload } = useAnalytics("/analytics/reading-coaching", query);
  const [sort, setSort] = useState({ key: "read", dir: -1 });
  const [open, setOpen] = useState(null);
  const detailRef = useRef(null);
  const list = ((data && data.consultants) || []).filter((c) => c.read > 0);
  const col = COLUMNS.find((x) => x.key === sort.key) || COLUMNS[0];
  // who has no value for the column goes last, whatever the direction
  const sorted = [...list].sort((a, b) => {
    const va = col.value(a);
    const vb = col.value(b);
    if (va === null || va === undefined) return vb === null || vb === undefined ? a.name.localeCompare(b.name) : 1;
    if (vb === null || vb === undefined) return -1;
    return (va - vb) * sort.dir || a.name.localeCompare(b.name);
  });
  const by = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));
  const chosen = open ? list.find((c) => c.userId === open) : null;
  const show = (id) => {
    setOpen((o) => (o === id ? null : id));
    setTimeout(() => { if (detailRef.current) detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  };
  const team = data && data.team;
  return (
    <section style={{ minWidth: 0, marginBottom: 16 }}>
      <Header title="Como cada consultor atende (leitura das conversas)" hint="Notas de 0 a 10 e o que aparece nas conversas copiadas do WhatsApp de cada consultor, sem dados pessoais. Clique no nome para ver os pontos a melhorar." win={win} setWin={setWin} />
      {error && !data ? <GlowPanel error onRetry={reload} />
        : loading && !data ? <GlowPanel loading />
        : !list.length ? <GlowPanel><EmptyNote>Ainda não há conversas lidas no período.</EmptyNote></GlowPanel>
        : (
          <div style={{ display: "grid", gap: 16, opacity: loading ? 0.75 : 1, transition: "opacity .2s ease" }}>
            <OldNote c={team} manager />
            <GlowPanel id="reading-team" title={`Equipe: ${num(team.read)} conversas lidas, ${team.conversion === null ? "-" : `${dec(team.conversion)}%`} viraram matrícula`}
              sub={team.improve && team.improve[0] ? `O ponto que mais se repete na equipe: ${team.improve[0].label.toLowerCase()} (${num(team.improve[0].n)} conversas).` : undefined}>
              <div className="pk-scroll">
                <table className="pk-table pk-stack">
                  <thead>
                    <tr>
                      <th>Consultor</th>
                      {COLUMNS.map((x) => (
                        <th key={x.key} className="r" aria-sort={sort.key === x.key ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
                          <button type="button" onClick={() => by(x.key)} style={{ border: 0, background: "none", font: "inherit", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 2 }}>
                            {x.label}{sort.key === x.key ? (sort.dir > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />) : null}
                          </button>
                        </th>
                      ))}
                      <th>Melhorar primeiro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c) => (
                      <tr key={c.userId} data-click="1" onClick={() => show(c.userId)} aria-selected={open === c.userId ? "true" : undefined}>
                        <td data-main="1" style={{ whiteSpace: "nowrap", fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Person name={c.name} size={28} />{c.name}</span></td>
                        {COLUMNS.map((x) => (
                          <td key={x.key} className="r" data-label={x.label}>
                            {x.tone && x.tone(c) !== null ? <span style={{ color: noteColor(x.tone(c)), fontWeight: 650 }}>{x.text(c)}</span> : x.text(c)}
                          </td>
                        ))}
                        <td data-label="Melhorar primeiro" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{c.improve[0] ? c.improve[0].label : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlowPanel>
            <div ref={detailRef}>
              {chosen && (
                <div style={{ display: "grid", gap: 12 }}>
                  <SectionTitle title={chosen.name} hint={`${num(chosen.read)} conversas lidas, ${num(chosen.evaluated)} avaliadas.`} action={<button type="button" className="pk-btn" onClick={() => setOpen(null)}>Fechar</button>} />
                  <CoachingDetail c={chosen} manager />
                </div>
              )}
            </div>
          </div>
        )}
    </section>
  );
};
