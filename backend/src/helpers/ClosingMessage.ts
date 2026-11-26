// A message that closes the subject: "ok", "obrigada!", "valeu, até mais", a thumbs up. When the client's last message is one of these, the
// conversation is not waiting for an answer (it does not count in "esperando resposta"). Anything with a question, a greeting or a new
// subject is not a closing: "ok, e o valor?" and "bom dia" still wait.
//
// The same list is used in SQL (Postgres "~*", see AWAITING_REPLY in AnalyticsService) and here, for the unit test. No single quote in it,
// so it goes inside a SQL string literal as it is.
const WORDS = [
  "ok+", "okay", "okey", "blz", "beleza", "show", "perfeito", "certo", "combinado", "entendi", "entendido", "fechado", "certinho",
  "obrigad[oa]s?", "obg", "brigad[oa]", "muito obrigad[oa]", "valeu", "vlw", "agrade[cç]o", "de nada",
  "t[aá] bom", "t[aá] certo", "t[aá] [oó]timo", "[oó]timo", "at[eé] mais", "at[eé] logo", "at[eé] amanh[aã]", "tchau", "abra[cç]os?",
  "deus te aben[cç]oe", "am[eé]m", "kk+", "rs+", "haha+"
];
const WORD = `(${WORDS.join("|")})`;

// Postgres (ARE): POSIX classes and \uXXXX / \UXXXXXXXX escapes
const PG_EMOJI = "[\\u2600-\\u27BF\\uFE0F\\U0001F300-\\U0001FAFF]";
const PG_SEP = "[[:space:][:punct:]]";
export const CLOSING_PATTERN = `^${PG_SEP}*${WORD}(${PG_SEP}+(e[[:space:]]+)?${WORD})*${PG_SEP}*(${PG_EMOJI}${PG_SEP}*)*$|^${PG_SEP}*(${PG_EMOJI}${PG_SEP}*)+$`;

// the JS twin (Unicode property escapes in place of the POSIX classes)
const JS_EMOJI = "[\\u2600-\\u27BF\\uFE0F\\u{1F300}-\\u{1FAFF}]";
const JS_SEP = "[\\s\\p{P}]";
const JS = new RegExp(`^${JS_SEP}*${WORD}(${JS_SEP}+(e\\s+)?${WORD})*${JS_SEP}*(${JS_EMOJI}${JS_SEP}*)*$|^${JS_SEP}*(${JS_EMOJI}${JS_SEP}*)+$`, "iu");

export const isClosingMessage = (text: string | null | undefined): boolean => {
  const t = String(text || "").trim();
  return !!t && JS.test(t);
};
