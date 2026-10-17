// Every e-mail the system sends is built here, on one layout: a header with the brand, the message, one clear button
// and a footer saying why the person got it. Table-based HTML with inline styles (the only thing mail apps all render),
// a hidden preview line and a plain-text twin for apps that do not show HTML.

export interface MailBody {
  subject: string;
  text: string;
  html: string;
}

import { LOGO_CID } from "./Logo";

const BRAND = "Cruzeiro do Sul Virtual";
const BLUE = "#0B4279";
const INK = "#17202b";
const MUTED = "#5b6877";
const LINE = "#dfe6ef";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const firstName = (name: string): string => (name || "").trim().split(/\s+/)[0] || "";
const greeting = (name: string): string => (firstName(name) ? `Olá, ${firstName(name)}!` : "Olá!");

interface Layout {
  // the hidden line that mail apps show next to the subject
  preheader: string;
  // which system sends it, in the header ("Chat Acadêmico", "Portal do Aluno")
  area: string;
  title: string;
  name: string;
  // paragraphs: plain text, or {b: "..."} for a line with bold parts written as **bold**
  paragraphs: string[];
  button?: { label: string; link: string };
  // a small table of facts (who, when, where)
  facts?: Array<[string, string]>;
  // grey fine print under the button
  notes?: string[];
  // why the person is receiving this (always present: it is what makes a message trustworthy)
  reason: string;
  // a warning line (security): shown in a tinted box
  alert?: string;
}

const rich = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const plain = (s: string): string => s.replace(/\*\*(.+?)\*\*/g, "$1");

const build = (subject: string, l: Layout): MailBody => {
  const paragraphs = l.paragraphs.map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${rich(p)}</p>`).join("");
  const facts = l.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;background:#f7f9fc">${l.facts
        .map(([k, v], i) => `<tr><td style="padding:10px 14px;font-size:13px;color:${MUTED};width:38%;${i ? `border-top:1px solid ${LINE};` : ""}">${esc(k)}</td><td style="padding:10px 14px;font-size:14px;color:${INK};font-weight:600;${i ? `border-top:1px solid ${LINE};` : ""}">${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const alert = l.alert
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="background:#fff7e6;border:1px solid #f3d9a4;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.5;color:#6b4a00">${rich(l.alert)}</td></tr></table>`
    : "";
  const button = l.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:10px;background:${BLUE}"><a href="${esc(l.button.link)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(l.button.label)}</a></td></tr></table>
    <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED}">Se o botão não abrir, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:${BLUE};word-break:break-all"><a href="${esc(l.button.link)}" style="color:${BLUE}">${esc(l.button.link)}</a></p>`
    : "";
  const notes = (l.notes || []).map(n => `<p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${MUTED}">${rich(n)}</p>`).join("");
  const year = new Date().getFullYear();
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(l.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="background:${BLUE};border-radius:14px 14px 0 0;padding:22px 28px">
      <img src="cid:${LOGO_CID}" width="230" height="54" alt="${esc(BRAND)}" style="display:block;border:0;outline:none;text-decoration:none;width:230px;height:auto;max-width:100%;font-family:${FONT};font-size:19px;font-weight:700;color:#ffffff">
      <div style="font-family:${FONT};font-size:13px;color:#b9d2ee;margin-top:10px">${esc(l.area)}</div>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-top:0;border-radius:0 0 14px 14px;padding:30px 28px 18px;font-family:${FONT}">
      <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${INK}">${esc(l.title)}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${esc(greeting(l.name))}</p>
      ${paragraphs}${facts}${alert}${button}${notes}
      <div style="border-top:1px solid ${LINE};margin-top:18px;padding-top:14px">
        <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED}">${esc(l.reason)}</p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">Esta é uma mensagem automática; não responda a este e-mail.</p>
      </div>
    </td></tr>
    <tr><td align="center" style="padding:16px 8px 4px;font-family:${FONT};font-size:12px;color:#8693a3">${esc(BRAND)} · Educação a distância · © ${year}</td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    `${BRAND} — ${l.area}`,
    "",
    l.title,
    "",
    greeting(l.name),
    "",
    ...l.paragraphs.map(p => plain(p) + "\n"),
    ...(l.facts || []).map(([k, v]) => `${k}: ${v}`),
    l.facts?.length ? "" : null,
    l.alert ? plain(l.alert) + "\n" : null,
    l.button ? `${l.button.label}:\n${l.button.link}\n` : null,
    ...(l.notes || []).map(n => plain(n)),
    "",
    "--",
    l.reason,
    "Esta é uma mensagem automática; não responda a este e-mail."
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return { subject, text, html };
};

const when = (d: Date): string => new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Porto_Velho" }).format(d);

// ------------------------------------------------------------------ team (people who use the system)

export const resetPasswordMail = (name: string, link: string, minutes: number): MailBody =>
  build("Redefinir a sua senha do Chat Acadêmico", {
    preheader: `Use o link para criar uma nova senha. Ele vale por ${minutes} minutos.`,
    area: "Chat Acadêmico",
    title: "Crie uma nova senha",
    name,
    paragraphs: ["Recebemos um pedido para redefinir a senha da sua conta no Chat Acadêmico.", `O link abaixo vale por **${minutes} minutos** e só pode ser usado uma vez.`],
    button: { label: "Criar nova senha", link },
    notes: ["Se você não fez este pedido, pode ignorar esta mensagem: a sua senha continua a mesma."],
    reason: "Você recebeu este e-mail porque alguém pediu a redefinição de senha para este endereço."
  });

export const passwordChangedMail = (name: string, loginLink: string, at: Date = new Date()): MailBody =>
  build("Sua senha do Chat Acadêmico foi alterada", {
    preheader: "A senha da sua conta acabou de ser alterada.",
    area: "Chat Acadêmico",
    title: "Sua senha foi alterada",
    name,
    paragraphs: ["A senha da sua conta no Chat Acadêmico foi alterada com sucesso. Por segurança, as sessões abertas antes disso foram encerradas."],
    facts: [["Quando", when(at)]],
    alert: "**Não foi você?** Peça uma nova senha agora em “Esqueci minha senha” e avise a coordenação.",
    button: { label: "Entrar no sistema", link: loginLink },
    reason: "Você recebeu este e-mail como aviso de segurança da sua conta."
  });

export const staffWelcomeMail = (name: string, roleLabel: string, email: string, loginLink: string): MailBody =>
  build("Bem-vindo ao Chat Acadêmico", {
    preheader: "Sua conta foi criada. Veja como entrar.",
    area: "Chat Acadêmico",
    title: "Sua conta está pronta",
    name,
    paragraphs: ["Uma conta foi criada para você no Chat Acadêmico, o sistema de atendimento e acompanhamento do Cruzeiro do Sul Virtual.", "A senha de acesso foi definida por quem criou a sua conta e não é enviada por e-mail. Se ainda não a recebeu, use “Esqueci minha senha” na tela de entrada para criar a sua."],
    facts: [["Perfil", roleLabel], ["Usuário", email]],
    button: { label: "Entrar no sistema", link: loginLink },
    reason: "Você recebeu este e-mail porque uma conta foi criada com o seu endereço."
  });

export const testMail = (): MailBody =>
  build("Chat Acadêmico: e-mail de teste", {
    preheader: "O envio de e-mails do sistema está funcionando.",
    area: "Chat Acadêmico",
    title: "O envio de e-mails está funcionando",
    name: "",
    paragraphs: ["Esta mensagem confirma que a conta de e-mail configurada consegue enviar mensagens do sistema.", "Os e-mails reais (redefinição de senha, convite do Portal do Aluno e avisos) usam este mesmo modelo."],
    facts: [["Enviado em", when(new Date())]],
    reason: "Você recebeu este e-mail porque um administrador pediu um teste em Configurações > E-mail."
  });

export const followUpMail = (name: string, items: Array<{ id: number; student: string; course: string; businessDays: number }>, listUrl: string): MailBody => {
  const urgent = items.some(i => i.businessDays > 2);
  const first = items.slice(0, 5).map(i => `**${i.student}** · ${i.course}`);
  return build(urgent ? `Urgente: ${items.length} resultado(s) de atendimento sem atualização` : `Registre o resultado de ${items.length === 1 ? "1 atendimento" : `${items.length} atendimentos`}`, {
    preheader: "Informe se a pessoa se matriculou para manter a carteira atualizada.",
    area: "Análise curricular",
    title: urgent ? "Resultados sem atualização há mais de 2 dias úteis" : "Registre o resultado do atendimento",
    name,
    paragraphs: [
      items.length === 1 ? "Já se passaram 24 horas desde a entrega desta análise. Informe se o candidato se matriculou." : `Já se passaram 24 horas desde a entrega de ${items.length} análises. Informe se os candidatos se matricularam.`,
      ...first,
      ...(items.length > 5 ? [`E mais ${items.length - 5}.`] : [])
    ],
    button: { label: "Registrar os resultados", link: listUrl },
    notes: ["Escolha Matriculou, Não se matriculou (com o motivo) ou Reanálise, que programa um novo retorno em 24 horas."],
    reason: "Você recebeu este e-mail porque entregou estas análises e o resultado ainda não foi informado."
  });
};

// ------------------------------------------------------------------ student portal

// invitation to the student portal (first access) and the recovery link of the student's password
export const studentLinkMail = (kind: "invite" | "reset", name: string, link: string, expires: string): MailBody => {
  const invite = kind === "invite";
  return build(invite ? "Seu acesso ao Portal do Aluno" : "Redefinir a senha do Portal do Aluno", {
    preheader: invite ? "Crie a sua senha e acompanhe a sua situação acadêmica." : `Use o link para criar uma nova senha. Ele vale por ${expires}.`,
    area: "Portal do Aluno",
    title: invite ? "Seu acesso ao Portal do Aluno está liberado" : "Crie uma nova senha",
    name,
    paragraphs: invite
      ? ["A sua equipe acadêmica liberou o seu acesso ao Portal do Aluno, onde você acompanha a sua situação acadêmica e a previsão de formatura.", `Crie a sua senha pelo link abaixo. Ele vale por **${expires}** e só pode ser usado uma vez.`]
      : ["Recebemos um pedido para criar uma nova senha no Portal do Aluno.", `O link abaixo vale por **${expires}** e só pode ser usado uma vez.`],
    button: { label: invite ? "Criar a minha senha" : "Criar nova senha", link },
    notes: [invite ? "Você entra com o seu RGM e a senha que criar agora." : "Se você não fez este pedido, pode ignorar esta mensagem: a sua senha continua a mesma."],
    reason: invite ? "Você recebeu este e-mail porque a sua equipe acadêmica cadastrou o seu endereço no Portal do Aluno." : "Você recebeu este e-mail porque alguém pediu a redefinição de senha do Portal do Aluno para este endereço."
  });
};

export const studentActivatedMail = (name: string, rgm: string, portalLink: string, at: Date = new Date()): MailBody =>
  build("Seu acesso ao Portal do Aluno foi ativado", {
    preheader: "Sua senha foi criada. Você já pode entrar.",
    area: "Portal do Aluno",
    title: "Acesso ativado",
    name,
    paragraphs: ["A sua senha do Portal do Aluno foi criada e o seu acesso está ativo. Por ele você consulta a sua análise acadêmica e acompanha as atualizações."],
    facts: [["RGM", rgm], ["Quando", when(at)]],
    alert: "**Não foi você?** Fale com a sua equipe acadêmica para bloquear o acesso.",
    button: { label: "Abrir o Portal do Aluno", link: portalLink },
    reason: "Você recebeu este e-mail como confirmação de segurança do seu acesso."
  });

export const studentAnalysisMail = (name: string, courseName: string, portalLink: string): MailBody =>
  build("Sua análise acadêmica foi atualizada", {
    preheader: "Há uma nova versão da sua análise no Portal do Aluno.",
    area: "Portal do Aluno",
    title: "Sua análise acadêmica foi atualizada",
    name,
    paragraphs: ["A sua equipe acadêmica atualizou a sua análise. Entre no Portal do Aluno para ver a sua situação atual, o que ainda falta cursar e a previsão de formatura.", "A previsão é uma estimativa e pode mudar conforme aprovações, rematrícula e oferta de disciplinas."],
    facts: courseName ? [["Curso", courseName]] : undefined,
    button: { label: "Ver minha análise", link: portalLink },
    reason: "Você recebeu este e-mail porque tem acesso ao Portal do Aluno."
  });

// ------------------------------------------------------------------ affiliates

export const affiliateWelcomeMail = (name: string, link: string): MailBody =>
  build("Seu acesso à Central do Afiliado", {
    preheader: "Acompanhe suas indicações e baixe os materiais de divulgação.",
    area: "Central do Afiliado",
    title: "Bem-vindo à Central do Afiliado",
    name,
    paragraphs: ["Você agora faz parte do programa de indicação do Cruzeiro do Sul Virtual. Na Central do Afiliado você acompanha as pessoas que indicou, vê as campanhas em andamento e baixa os materiais de divulgação.", "O acesso é feito pelo link abaixo, que é só seu. Não o compartilhe."],
    button: { label: "Abrir a Central do Afiliado", link },
    reason: "Você recebeu este e-mail porque foi cadastrado como afiliado do Cruzeiro do Sul Virtual."
  });

// a person was referred (by the affiliate's portal or by the affiliate's link): the consultant and the administration know at once
export const affiliateReferralMail = (
  name: string,
  r: { affiliate: string; person: string; phone: string; course?: string | null; consultant?: string | null; alreadyKnown: boolean },
  leadLink: string,
  forConsultant: boolean
): MailBody =>
  build(`${r.alreadyKnown ? "Nova indicação (já estava no CRM)" : "Nova indicação"}: ${r.person}`, {
    preheader: `${r.affiliate} indicou ${r.person}. Faça o primeiro contato pelo WhatsApp.`,
    area: "Chat Acadêmico",
    title: r.alreadyKnown ? "Indicação de uma pessoa que já está no CRM" : "Nova indicação de afiliado",
    name,
    paragraphs: [
      `**${r.affiliate}** indicou **${r.person}**.${forConsultant ? " A pessoa está na coluna Indicações de afiliados, esperando o seu primeiro contato." : ""}`,
      ...(r.alreadyKnown ? ["Essa pessoa já estava no CRM: nada foi duplicado."] : [])
    ],
    facts: [
      ["Indicado por", r.affiliate],
      ["Nome", r.person],
      ["WhatsApp", r.phone],
      ...(r.course ? ([["Curso de interesse", r.course]] as Array<[string, string]>) : []),
      ["Consultor responsável", r.consultant || "Ainda sem responsável"]
    ],
    button: { label: "Abrir no CRM", link: leadLink },
    reason: forConsultant
      ? "Você recebeu este e-mail porque é o consultor responsável por este afiliado."
      : "Você recebeu este e-mail porque administra o sistema e acompanha as indicações dos afiliados."
  });

// ------------------------------------------------------------------ catalog (preview and test on the E-mail screen)

export interface MailTemplateInfo {
  key: string;
  title: string;
  audience: string;
  trigger: string;
  automatic: boolean;
  build: () => MailBody;
}

const SAMPLE_LINK = "https://chat.exemplo.edu.br/acesso/abc123";

export const MAIL_CATALOG: MailTemplateInfo[] = [
  { key: "password-reset", title: "Redefinir a senha", audience: "Equipe", trigger: "Quando a pessoa pede “Esqueci minha senha” na tela de entrada.", automatic: true, build: () => resetPasswordMail("Maria Souza", SAMPLE_LINK, 30) },
  { key: "password-changed", title: "Senha alterada", audience: "Equipe", trigger: "Logo depois que a pessoa cria a nova senha pelo link do e-mail.", automatic: true, build: () => passwordChangedMail("Maria Souza", SAMPLE_LINK) },
  { key: "staff-welcome", title: "Boas-vindas à equipe", audience: "Equipe", trigger: "Quando um administrador cria uma conta nova com e-mail.", automatic: true, build: () => staffWelcomeMail("Maria Souza", "Consultor", "maria.souza@exemplo.edu.br", SAMPLE_LINK) },
  { key: "student-invite", title: "Convite do Portal do Aluno", audience: "Aluno", trigger: "Quando a equipe envia o convite pela tela Alunos do portal.", automatic: true, build: () => studentLinkMail("invite", "João Pereira", SAMPLE_LINK, "7 dias") },
  { key: "student-reset", title: "Nova senha do Portal do Aluno", audience: "Aluno", trigger: "Quando o aluno pede a recuperação da senha no portal, ou a equipe reenvia o acesso.", automatic: true, build: () => studentLinkMail("reset", "João Pereira", SAMPLE_LINK, "1 hora") },
  { key: "student-activated", title: "Acesso do aluno ativado", audience: "Aluno", trigger: "Quando o aluno cria a senha pelo convite.", automatic: true, build: () => studentActivatedMail("João Pereira", "44868774", SAMPLE_LINK) },
  { key: "student-analysis", title: "Análise atualizada", audience: "Aluno", trigger: "Quando a equipe publica uma nova versão da análise de um aluno que já ativou o portal.", automatic: true, build: () => studentAnalysisMail("João Pereira", "Pedagogia (Licenciatura)", SAMPLE_LINK) },
  { key: "follow-up", title: "Retorno de matrícula (24 h)", audience: "Equipe", trigger: "Quando o resultado de uma análise curricular continua sem resposta 24 h depois da entrega; repete nos dias úteis, de manhã e à tarde.", automatic: true, build: () => followUpMail("Maria Souza", [{ id: 1, student: "Raimunda Exemplo", course: "CST em Gestão Pública", businessDays: 1 }, { id: 2, student: "João Pereira", course: "Pedagogia (Licenciatura)", businessDays: 3 }], SAMPLE_LINK) },
  { key: "affiliate-welcome", title: "Boas-vindas ao afiliado", audience: "Afiliado", trigger: "Enviado manualmente pelo botão “Enviar acesso por e-mail” do afiliado.", automatic: false, build: () => affiliateWelcomeMail("Carlos Lima", SAMPLE_LINK) },
  { key: "affiliate-referral", title: "Nova indicação de afiliado", audience: "Consultor e administração", trigger: "Quando um afiliado indica alguém pela Central do Afiliado ou pelo link de indicação.", automatic: true, build: () => affiliateReferralMail("Maria Souza", { affiliate: "Carlos Lima", person: "Ana Pereira", phone: "+55 (69) 99999-0000", course: "Pedagogia (Licenciatura)", consultant: "Maria Souza", alreadyKnown: false }, SAMPLE_LINK, true) },
  { key: "mail-test", title: "E-mail de teste", audience: "Administração", trigger: "Botão “Enviar e-mail de teste” em Configurações > E-mail.", automatic: false, build: () => testMail() }
];
