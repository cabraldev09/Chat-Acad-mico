import React, { useMemo, useState } from "react";
import { Lightbulb, MessageCircle, Palette } from "lucide-react";

import { CopyButton } from "./shared";
import ArtMaker from "./ArtMaker";
import { IDEAS, MESSAGES, courseOfDay, fill } from "./promoContent";

const whatsapp = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// the idea of the day (with the others of the week one click away): why it works, the text ready with her link, and the way to use it
const DailyIdea = ({ nome, link, courses, onMakeArt }) => {
  const today = new Date().getDay();
  const [picked, setPicked] = useState(today);
  const idea = IDEAS[picked];
  const curso = idea.needsCourse ? courseOfDay(courses, new Date()) : "";
  const text = fill(idea.needsCourse && !curso ? idea.fallback : idea.text, { nome, link, curso });
  return (
    <section className="ca-idea" aria-label="Ideia para divulgar hoje">
      <div className="ca-idea-head">
        <span className="ca-over"><Lightbulb size={14} style={{ verticalAlign: "-2px" }} /> {picked === today ? `Divulgue hoje · ${WEEKDAYS[today]}` : `Ideia de ${WEEKDAYS[picked]}`}</span>
        <h2 className="ca-h2">{idea.title}</h2>
        <p className="ca-help">{idea.why}</p>
        <span className="ca-pill">{idea.channel}</span>
      </div>
      <div className="ca-idea-body">
        <div className="ca-copy" tabIndex={0}>{text}</div>
        <div className="ca-link-actions">
          <CopyButton text={text} className="ca-btn is-primary" label="Copiar texto" ok="Texto copiado!" />
          <a className="ca-btn is-wa" href={whatsapp(text)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Enviar no WhatsApp</a>
          <button type="button" className="ca-btn" onClick={() => onMakeArt(curso)}><Palette size={16} /> Gerar arte</button>
        </div>
        <div className="ca-chips" role="group" aria-label="Ideias da semana">
          {IDEAS.map((it, i) => (
            <button key={it.key} type="button" className="ca-chip" aria-pressed={picked === i} onClick={() => setPicked(i)}>{i === today ? "Hoje" : WEEKDAYS[i]}</button>
          ))}
        </div>
      </div>
    </section>
  );
};

// messages for the usual situations: pick one, pick (or not) a course, copy or send
export const Messages = ({ nome, link, courses }) => {
  const [key, setKey] = useState(MESSAGES[0].key);
  const [curso, setCurso] = useState("");
  const msg = MESSAGES.find((m) => m.key === key) || MESSAGES[0];
  const text = useMemo(() => fill(msg.text, { nome, link, curso }), [msg, nome, link, curso]);
  return (
    <div className="ca-box">
      <h3>Mensagens prontas</h3>
      <small>Já saem com o seu nome e o seu link. Escolha a situação e copie.</small>
      <div className="ca-chips" style={{ margin: "14px 0" }} role="group" aria-label="Situação">
        {MESSAGES.map((m) => <button key={m.key} type="button" className="ca-chip" aria-pressed={key === m.key} onClick={() => setKey(m.key)}>{m.title}</button>)}
      </div>
      {courses.length > 0 && (
        <label className="ca-field" style={{ marginBottom: 12 }}><span>Curso na mensagem (opcional)</span>
          <select value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">Sem curso</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
      <div className="ca-copy" tabIndex={0}>{text}</div>
      <p className="ca-help" style={{ margin: "8px 0 12px" }}>Para usar em: {msg.where}.</p>
      <div className="ca-link-actions">
        <CopyButton text={text} className="ca-btn is-primary" label="Copiar mensagem" ok="Mensagem copiada!" />
        <a className="ca-btn is-wa" href={whatsapp(text)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Enviar no WhatsApp</a>
      </div>
    </div>
  );
};

// the idea of the day, the messages and the generator of art, with her name, her link and the courses she can promote
const PromoKit = ({ nome, link, groups }) => {
  const courses = useMemo(() => [...new Set((groups || []).flatMap((g) => g.courses.map((c) => c.name)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [groups]);
  const [art, setArt] = useState({ key: 0, curso: "" });
  const makeArt = (curso) => {
    setArt((a) => ({ key: a.key + 1, curso: curso || "" }));
    setTimeout(() => { const el = document.getElementById("ca-arte"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  };
  return (
    <>
      <DailyIdea nome={nome} link={link} courses={courses} onMakeArt={makeArt} />
      <div className="ca-kit">
        <Messages nome={nome} link={link} courses={courses} />
        <div className="ca-box" id="ca-arte">
          <h3>Gerador de arte</h3>
          <small>Um cartão com o seu QR Code, no tamanho do story ou do feed.</small>
          <ArtMaker key={art.key} nome={nome} link={link} courses={courses} initialCourse={art.curso} />
        </div>
      </div>
    </>
  );
};

export default PromoKit;
