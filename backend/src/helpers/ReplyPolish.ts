import { Op } from "sequelize";
import Message from "../models/Message";

// What the AI writes passes here before it goes out, whatever the agent and the model. It fixes what the team does not want the lead to read:
//   - "valor de tabela" / "pode variar conforme a proposta": the institution works with scholarships; the consultant makes the simulation;
//   - robotic confirmations ("Sua informação foi salva com sucesso");
//   - the same "a consultant will continue" notice twice in a row (the model announces it and the system announces it again).
export const PRICE_SENTENCE = "Trabalhamos com bolsas de estudo, que dependem da disponibilidade. O consultor faz a simulação para você com a melhor condição.";

const plain = (s: string): string => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PRICE_TABLE = /(valor|preco|mensalidade)s?\s+de\s+tabela|pode(m)?\s+variar\s+conforme\s+(a\s+)?(proposta|negociacao)/;
const ROBOTIC = /(sua|suas|seu|seus)\s+(informac(ao|oes)|dados)\s+(foi|foram)\s+(salv|registrad|armazenad|anotad)|(salvei|registrei|anotei|armazenei)\s+(sua|suas|seu|seus)\s+(informac|dados)|informac(ao|oes)\s+salva(s)?\s+com\s+sucesso/;

// "um consultor vai continuar", "vou chamar um consultor", "nossa equipe entrará em contato"
export const isHandoffNotice = (text: string): boolean =>
  /\b(consultor|consultora|equipe|atendente|especialista)\b/.test(plain(text)) &&
  /\b(chamar|chamando|continuar|continua|continuidade|entrar em contato|entrara em contato|falar com voce|seguir com voce|retornar|assumir)\b/.test(plain(text));

// sentences, keeping the line breaks between paragraphs
const sentencesOf = (paragraph: string): string[] => paragraph.match(/[^.!?]+[.!?]*\s*/g) || [paragraph];

export const polishReply = (input: string): string => {
  let priceSaid = false;
  const paragraphs = String(input || "").split(/\n{2,}/).map(paragraph => {
    const kept = sentencesOf(paragraph).filter(sentence => {
      const p = plain(sentence);
      if (ROBOTIC.test(p)) return false;
      if (PRICE_TABLE.test(p)) {
        if (priceSaid) return false;
        priceSaid = true;
        return true;
      }
      return true;
    }).map(sentence => {
      if (!PRICE_TABLE.test(plain(sentence))) return sentence;
      // a value from the catalogue stays (without the word "tabela"), followed by the scholarship sentence; the "it may vary" kind is replaced
      if (/R\$\s*\d/.test(sentence) && !/pode(m)?\s+variar/.test(plain(sentence))) {
        return `${sentence.replace(/\s+de\s+tabela/gi, "").trim()} ${PRICE_SENTENCE} `;
      }
      return `${PRICE_SENTENCE} `;
    });
    return kept.join("").trim();
  });
  return paragraphs.filter(Boolean).join("\n\n").trim();
};

// the AI already told the lead, a moment ago, that a consultant will continue: the second notice is not sent
export const repeatsHandoff = async (ticketId: number, text: string): Promise<boolean> => {
  if (!isHandoffNotice(text)) return false;
  const last = await Message.findOne({
    where: { ticketId, fromMe: true, createdAt: { [Op.gte]: new Date(Date.now() - 3 * 60000) } } as any,
    order: [["createdAt", "DESC"]],
    attributes: ["body"]
  });
  return !!last && isHandoffNotice(String(last.body || ""));
};

// A paragraph the AI already sent in this conversation (the duration of the course, the format) is not sent again, and the same
// paragraph twice in one answer goes once. Short lines ("Ficou alguma dúvida?") may come back: only paragraphs of some length count.
const REPEAT_MIN = 60;
const keyOf = (paragraph: string): string => plain(paragraph).replace(/[*_~]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export const dropRepeatedParagraphs = (text: string, alreadySent: string[]): string => {
  const seen = new Set<string>();
  alreadySent.forEach(body => String(body || "").split(/\n{2,}/).forEach(p => { const k = keyOf(p); if (k.length >= REPEAT_MIN) seen.add(k); }));
  const kept = String(text || "").split(/\n{2,}/).filter(p => {
    const k = keyOf(p);
    // a question is the next step of the process: asking it again is how the conversation goes on (only information is not repeated)
    if (k.length < REPEAT_MIN || /\?[\s"”')]*$/.test(p.trim())) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // everything was already said (the person asked the same thing again): the answer goes as it is, a person who wrote always gets a reply
  return kept.length ? kept.join("\n\n").trim() : String(text || "").trim();
};

// what the conversation already got from us today (enough to catch the AI repeating itself, light on the database)
export const withoutRepeats = async (ticketId: number, text: string): Promise<string> => {
  const sent = await Message.findAll({
    where: { ticketId, fromMe: true, createdAt: { [Op.gte]: new Date(Date.now() - 24 * 3600000) } } as any,
    order: [["createdAt", "DESC"]],
    limit: 40,
    attributes: ["body"]
  });
  const out = dropRepeatedParagraphs(text, sent.map(m => String(m.body || "")));
  // the conversation is already going (we wrote in the last 24 h): no "Oi! Como posso te ajudar?" opening again
  return sent.length ? withoutOpeningGreeting(out) : out;
};

export const withoutOpeningGreeting = (text: string): string => {
  const out = String(text || "")
    .replace(/^(oi|ol[aá]|bom dia|boa tarde|boa noite)\b[^.!?\n]{0,30}[.!?]\s*/i, "")
    .replace(/^como posso (te |lhe )?ajudar( hoje)?\??\s*/i, "")
    .trim();
  // a reply that was only a greeting keeps it (better than sending nothing to a person who wrote)
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : String(text || "").trim();
};

// a suggestion in the middle of a conversation: no greeting opening it, no question about what is already known, one question at the end
export const midConversation = (text: string, known: Record<string, string>): string => {
  const plainOf = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let out = String(text || "").trim()
    // "Oi, Vitor!", "Olá!", "Bom dia, Vitor." at the start
    .replace(/^(oi|ola|olá|bom dia|boa tarde|boa noite|tudo bem)[^.!?\n]{0,30}[.!?]\s*/i, "")
    // "Oi, Vitor! Que bom que..." leftovers
    .replace(/^que bom que [^.!?\n]*[.!?]\s*/i, "");
  const paragraphs = out.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).filter(p => {
    const t = plainOf(p);
    if (known.nome && /(como (posso|devo) (te|lhe) chamar|qual (e|o) (o )?seu nome)/.test(t)) return false;
    if (known.cidade && /(qual (e |a )?(sua )?cidade|de (qual|que) cidade|onde voce mora)/.test(t)) return false;
    return true;
  });
  // only the last question stays a question; earlier lone questions are dropped so the person answers one thing
  const questions = paragraphs.filter(p => /\?\s*$/.test(p));
  const kept = questions.length > 1 ? paragraphs.filter(p => !/\?\s*$/.test(p) || p === questions[questions.length - 1]) : paragraphs;
  out = kept.join("\n\n").trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : out;
};
