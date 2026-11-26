// Lists every API route with who can call it, read from the route files. Run: node scripts/audit-routes.js
// The point is the "review" list: routes that change data and only ask for a login (any role, any person's data).
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../src/routes");
const rows = [];
fs.readdirSync(dir).filter(f => f.endsWith(".ts")).forEach(file => {
  const text = fs.readFileSync(path.join(dir, file), "utf8").replace(/\n\s+/g, " ");
  const re = /\b(?:r|\w*Routes?|router)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2\s*,([^;]*)\);/g;
  let m;
  while ((m = re.exec(text))) {
    const args = m[4].split(",").map(s => s.trim()).filter(Boolean);
    const guards = args.slice(0, -1).filter(a => /^[a-zA-Z]+$/.test(a));
    const who = guards.includes("isAuthApi") ? "token da API" : guards.includes("isSystemAdmin") ? "admin" : guards.includes("isAdmin") ? "admin" : guards.includes("isManager") ? "gestão" : guards.includes("isAuth") ? "logado" : "público";
    const scoped = guards.filter(g => !["isAuth", "isAdmin", "isSystemAdmin", "isManager", "cached"].includes(g) && !g.startsWith("upload") && !g.startsWith("rateLimit"));
    rows.push({ file, method: m[1].toUpperCase(), path: m[3], who, scoped: scoped.join(", ") });
  }
});
const mut = r => r.method !== "GET";
const count = k => rows.filter(r => r.who === k).length;
console.log(`# Rotas da API (${rows.length})\n`);
console.log(`Públicas: ${count("público")} · logado (qualquer perfil): ${count("logado")} · gestão: ${count("gestão")} · admin: ${count("admin")}\n`);
// the rule of the data behind the routes: who sees which leads (middleware/scope.ts). Written here so the generated file keeps it.
console.log(`## Quem vê quais leads no CRM (middleware/scope.ts)

| Perfil | Vê |
|---|---|
| admin | todos os leads, de todos os polos |
| coordenacao | só os leads dos polos em que está (Polos e equipes); sem polo, nenhum. Um lead ainda sem polo fica com a administração |
| consultor | só os leads em que é o responsável. Com a **fila comum** ligada (\`crm_queue_mode\`, desligada por padrão) também lê, como cartão sem CPF/documentos/anotações, os leads novos sem dono; para agir neles precisa **assumir** antes (\`POST /leads/:id/claim\`) |
| tutor, academico | os leads em que é o responsável e os alunos dados a ele (Ambientação e Alunos da tutoria: também os do seu polo ainda sem tutor) |
| relacionamento | só os matriculados dos polos em que está; sem polo, nenhum |

A mesma regra vale nas telas do CRM de leads: lista, quadro, busca, ficha do lead e o que pende dela (atividades, tarefas, propostas,
cobranças, documentos), contagens do Painel do CRM, novos para conferir, tarefas da equipe, Relatório do CRM (CSV), Matrículas
realizadas, comissões, Alunos da tutoria e Avisos da tutoria, Retenção e os avisos em tempo real de lead, risco e satisfação.
A coordenação continua com os poderes da gestão (\`isAdminReq\`): o que muda é o que ela vê. Ela só muda a equipe e os dados (cidades
atendidas, nome, exclusão, importação) dos polos em que está.

## Conversas, contatos, metas e painéis por polo (helpers/TicketPoloScope.ts)

| Perfil | Conversas e contatos |
|---|---|
| admin | todos |
| coordenacao | as conversas dadas a ela e as dos seus polos: fila de um dos seus polos ou contato que é lead de um deles. Conversa sem polo (fila sem polo e contato que não é lead dos seus polos) fica com a administração. Sem polo, nenhuma |
| relacionamento | as conversas dadas a ele e as dos alunos matriculados dos seus polos (a fila do Relacionamento não tem polo) |
| consultor, tutor, academico | sem mudança: as próprias e as que esperam nas suas filas |

- A regra vale no backend em todas as portas:
  - lista, busca e contagens (\`ListTicketsService\`);
  - conversa, mensagens, alterar, excluir e marcar como lida (\`assertTicketAccess\`, \`readAll\`);
  - tempo real (\`joinChatBox\`, \`ticket\`, \`appMessage\`, \`typing\`, \`aiHandoff\`, \`handoffAlert\`);
  - contatos: lista, planilha, ficha, busca por número (\`POST /contact\`) e exclusão.
- **Conversa sem polo é da administração (triagem de entrada):** o primeiro contato no número compartilhado, antes de virar lead
  com polo, não aparece para nenhuma coordenação; a coordenação sem polo vinculado não vê nenhuma conversa nem contato. Antes de
  liberar a coordenação, confira os vínculos de polo (Polos e equipes).
- **Avisos com dados de pessoas** vão à administração e só à coordenação do polo envolvido (\`managerIdsOfPolos\`,
  \`managerIdsOfUser\`); lead ou análise sem polo, só à administração:
  - lead encaminhado pela IA, prazo escalado e treinamento sugerido (sino);
  - indicação de afiliado (e-mail com nome, telefone e curso; \`ReferralNotice\`);
  - ambientação atrasada (sino com o nome do aluno; \`OnboardingSla\`);
  - retorno da análise curricular sem resposta há dois dias úteis (e-mail e tempo real com os candidatos; \`FollowUpAlert\`).
- **Metas:** todos os logados leem as metas de todos os polos e consultores (\`GET /goals\`, \`/goals/polos\`,
  \`/dashboard/polos-progress\`; decisão do dono registrada em 2026-11-25). A coordenação muda só:
  - a linha dos seus polos (e não cria polo pela importação);
  - metas de equipe em que todas as pessoas estão nos seus polos.

  O ciclo inteiro (criar, datas, excluir, repetir, adiar, dias úteis) é da administração.
- **Painéis** (\`/dashboard\`, \`/dashboard/management\`, \`/dashboard/manager\`, \`/dashboard/management/feedback\`):
  - a coordenação vê os números dos seus polos;
  - em \`/dashboard/manager\`, as metas de todos os polos continuam visíveis;
  - estatísticas de consultores e "Equipe agora": coordenação sem polo não vê ninguém.

## Agendamentos, campanhas e listas de contatos por polo (helpers/ListScope.ts)

| Perfil | Vê e usa |
|---|---|
| admin | todos |
| coordenacao | os agendamentos que fez e os de contatos dos seus polos; as listas que criou ou cujas pessoas estão TODAS nos seus polos; as campanhas que criou ou feitas com essas listas. Pessoa que não é lead nem contato de nenhum polo (número colado) é da administração. Sem polo, só o que ela mesma criou |
| consultor, tutor | sem mudança (o consultor vê as listas e campanhas como antes; o tutor só o que criou) |

- A regra vale no SQL da lista e em abrir, editar, apagar, cancelar, exportar, iniciar, pausar, duplicar, testar, relatório e eventos em tempo real
  (\`schedule\`, \`campaign\`, \`contactList\`).
- A coordenação só coloca em lista (do CRM ou número colado) pessoas dos seus polos; o resto fica de fora (\`outOfScope\` na resposta).
- Ao iniciar uma campanha da coordenação, os destinatários são conferidos de novo contra os polos de quem a criou: quem entrou na lista depois e é de outro polo não recebe.
- Fora desta regra (continua como estava): afiliados e a lista de usuários.

Com agendamentos, campanhas e listas isolados, a trava "não crie usuários de coordenação nem de relacionamento para franquias diferentes" depende
só dos itens acima e das outras áreas da coordenação (análises, alunos do portal, boletins e conexões: ESP-011).
`);
console.log("## Públicas (sem login)\n");
rows.filter(r => r.who === "público").forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
console.log("\n## Para revisar: alteram dados e só pedem login, sem checagem de escopo\n");
rows.filter(r => r.who === "logado" && mut(r) && !r.scoped).forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
console.log("\n## Alteram dados com checagem de escopo\n");
rows.filter(r => r.who === "logado" && mut(r) && r.scoped).forEach(r => console.log(`- ${r.method} ${r.path} → ${r.scoped}`));
console.log("\n## Painel da gestão (admin e coordenação)\n");
rows.filter(r => r.who === "gestão" && r.path.startsWith("/dashboard/")).forEach(r => console.log(`- ${r.method} ${r.path} (${r.file})`));
