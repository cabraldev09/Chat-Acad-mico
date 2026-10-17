// Ready-to-use content of the affiliate home: one idea for each day of the week, messages for the usual situations and
// the phrases of the art. Nothing here names a price, a discount or a promise of the institution (the portal never
// shows values): it only invites the person to leave their data and talk to a consultant.
//
// A text can use {{nome}} (the first name of the affiliate), {{link}} (her referral link) and {{curso}} (the course
// she chose). A part written between [[ and ]] only stays when it has a course: "[[Estou de olho em {{curso}}.]]".

export const fill = (template, { nome = "", link = "", curso = "" } = {}) => {
  const withCourse = curso
    ? template.replace(/\[\[([\s\S]+?)\]\]/g, "$1")
    : template.replace(/\s*\[\[([\s\S]+?)\]\]/g, "");
  return withCourse.replace(/\{\{nome\}\}/g, nome).replace(/\{\{link\}\}/g, link).replace(/\{\{curso\}\}/g, curso).replace(/[ \t]+\n/g, "\n").trim();
};

// the days start on Sunday, like Date#getDay
export const IDEAS = [
  {
    key: "familia", day: "domingo", title: "Convite no grupo da família",
    channel: "WhatsApp", why: "Domingo é o dia em que a família conversa. Quem confia em você escuta a sua dica.",
    text: "Pessoal, uma dica para quem quer estudar sem largar a rotina: a Cruzeiro do Sul Virtual tem cursos a distância.[[ Estou de olho em {{curso}}.]] Quem tiver interesse (ou conhecer alguém) é só deixar os dados por aqui, que um consultor chama: {{link}}",
  },
  {
    key: "recomeco", day: "segunda", title: "Segunda de recomeço",
    channel: "Status ou story", why: "No começo da semana as pessoas pensam em mudar. Uma frase curta e o link já bastam.",
    text: "Segunda-feira é bom para recomeçar. Se estudar entrou nos seus planos, dá para começar pela conversa: {{link}}",
  },
  {
    key: "pergunta", day: "terça", title: "Pergunta nos stories",
    channel: "Instagram", why: "Perguntas geram resposta, e resposta vira conversa. Depois é só mandar o link para quem respondeu.",
    text: "Quem aqui já pensou em fazer uma graduação, mas acha que não tem tempo? Me conta aqui na caixinha. Estudar a distância pode caber na sua rotina. Quer entender como? {{link}}",
  },
  {
    key: "curso", day: "quarta", title: "Curso em destaque",
    channel: "Feed ou status", why: "Falar de um curso específico é mais convincente do que falar de estudar em geral.",
    text: "Você já pensou em estudar {{curso}}? Posso te indicar para um consultor da Cruzeiro do Sul Virtual tirar todas as suas dúvidas, sem compromisso: {{link}}",
    // when the list of courses is empty
    fallback: "Você já pensou em voltar a estudar? Posso te indicar para um consultor da Cruzeiro do Sul Virtual tirar todas as suas dúvidas, sem compromisso: {{link}}",
    needsCourse: true,
  },
  {
    key: "duvida", day: "quinta", title: "Tirando uma dúvida comum",
    channel: "Story ou grupo", why: "Quem tem medo de estudar a distância costuma ter a mesma dúvida. Responder antes derruba a barreira.",
    text: "Estudar a distância exige organização, mas dá para encaixar nos seus horários. Se você quer entender como funciona na prática, deixa seus dados aqui e um consultor explica tudo: {{link}}",
  },
  {
    key: "carreira", day: "sexta", title: "Mudança de carreira",
    channel: "Feed, grupo ou conversa", why: "Quase todo mundo conhece alguém que quer trocar de área. Marque essa pessoa.",
    text: "Conhece alguém que quer mudar de carreira ou voltar a estudar? Manda esse link para a pessoa: {{link}}",
  },
  {
    key: "historia", day: "sábado", title: "Por que eu indico",
    channel: "Feed ou story", why: "Uma história sua pesa mais do que qualquer texto pronto. Complete a frase com a sua experiência.",
    text: "Eu indico a Cruzeiro do Sul Virtual porque (conte aqui, em uma frase, o que você acha bom). Se você também quer estudar, deixa seus dados por aqui: {{link}}",
  },
];

export const ideaOfDay = (date = new Date()) => IDEAS[date.getDay()];

export const MESSAGES = [
  {
    key: "primeiro", title: "Primeiro contato", where: "Conversa direta",
    text: "Oi! Tudo bem? Aqui é {{nome}}. Lembrei de você: a Cruzeiro do Sul Virtual tem cursos a distância[[, como {{curso}}]]. Se tiver interesse, deixa seus dados neste link que um consultor entra em contato: {{link}}",
  },
  {
    key: "grupo", title: "Grupo de WhatsApp", where: "Grupos",
    text: "Pessoal, passando para compartilhar uma oportunidade: cursos a distância da Cruzeiro do Sul Virtual[[, inclusive {{curso}}]]. Quem quiser saber mais é só deixar os dados no link e um consultor chama: {{link}}",
  },
  {
    key: "instagram", title: "Legenda para Instagram", where: "Feed e reels",
    text: "Estudar cabe na sua rotina.[[ Já pensou em {{curso}}?]] Fale com um consultor da Cruzeiro do Sul Virtual e tire suas dúvidas. Link na bio ou direto aqui: {{link}}\n\n#estudaradistancia #cruzeirodosulvirtual #educacao #graduacao",
  },
  {
    key: "retorno", title: "Retorno a quem pediu informação", where: "Conversa direta",
    text: "Oi! Aqui é {{nome}}. Você tinha me perguntado sobre estudar[[ {{curso}}]]. Deixa seus dados neste link que um consultor da Cruzeiro do Sul Virtual te explica tudo com calma: {{link}}",
  },
  {
    key: "amiga", title: "Indicação para uma amiga", where: "Conversa direta",
    text: "Oi, amiga! Lembrei de você: se ainda quer estudar[[ ({{curso}})]], olha essa opção da Cruzeiro do Sul Virtual. Deixa seus dados no link e um consultor fala com você: {{link}}",
  },
];

// short phrases for the card of art (they fit on a story and on a post)
export const PHRASES = [
  "Estudar a distância cabe na sua rotina.",
  "Seu próximo passo começa aqui.",
  "Faça a sua graduação no seu ritmo.",
  "Mude de carreira. Estude com a gente.",
  "Aponte a câmera e conheça.",
  "Indique, estude, transforme.",
];

// the course of the day for the idea that needs one: always the same one on a given day, so the text does not change on every visit
export const courseOfDay = (courses, date = new Date()) => {
  if (!courses.length) return "";
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return courses[dayOfYear % courses.length];
};

export const linkWithoutScheme = (link) => String(link || "").replace(/^https?:\/\//i, "");
