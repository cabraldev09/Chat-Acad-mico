// Read-only: who is "responsible" for each new lead and open task, and why (lead owner, conversation owner, WhatsApp connection owner).
const sequelize = require("/app/backend/dist/database").default;
const q = async (title, sql) => {
  const [rows] = await sequelize.query(sql);
  console.log("== " + title + " ==");
  rows.forEach(r => console.log(JSON.stringify(r)));
};
(async () => {
  await q("usuários", `SELECT id, name, profile FROM "Users" ORDER BY id`);
  await q("conexões", `SELECT id, name, status, "ownerId" FROM "Whatsapps" ORDER BY id`);
  await q("leads novos sem 1º contato", `SELECT l.id, l.name, l."ownerId" AS lead_owner, t.id AS ticket, t.status AS t_status, t."userId" AS t_user, t."whatsappId" AS t_wa, w."ownerId" AS wa_owner, l."createdAt"::date AS dia
    FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId"
    LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."leadId" = l.id ORDER BY t2.id DESC LIMIT 1)
    LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE s.type = 'open' AND l."firstContactAt" IS NULL AND l."enrolledAt" IS NULL AND l."isHistorical" = false ORDER BY l."createdAt" LIMIT 40`);
  await q("conversas dos leads novos (por telefone do contato)", `SELECT l.id AS lead, l.name, l."ownerId" AS lead_owner, c.id AS contact, t.id AS ticket, t.status, t."userId" AS t_user, t."whatsappId" AS t_wa, w."ownerId" AS wa_owner, t."leadId" AS t_lead
    FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId" JOIN "Contacts" c ON c.number = regexp_replace(COALESCE(l.phone,''), '\\D', '', 'g')
    JOIN "Tickets" t ON t."contactId" = c.id LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE s.type = 'open' AND l."firstContactAt" IS NULL AND l."enrolledAt" IS NULL AND l."isHistorical" = false ORDER BY l.id, t.id LIMIT 60`);
  await q("tarefas em aberto vencidas", `SELECT k.id, k.title, k."userId" AS task_user, l.name AS lead, l."ownerId" AS lead_owner, t.status AS t_status, t."userId" AS t_user, w."ownerId" AS wa_owner
    FROM "LeadTasks" k LEFT JOIN "Leads" l ON l.id = k."leadId"
    LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."leadId" = l.id ORDER BY t2.id DESC LIMIT 1)
    LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE k."doneAt" IS NULL AND k."dueAt" < now() ORDER BY k."dueAt" LIMIT 40`);
  await q("1º contato (últimos 30 dias) por responsável", `SELECT COALESCE(t."userId", l."ownerId") AS resp, COUNT(*) AS n FROM "Leads" l LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."leadId" = l.id ORDER BY t2.id DESC LIMIT 1)
    WHERE l."firstContactAt" IS NOT NULL AND l."createdAt" > now() - interval '30 days' GROUP BY 1`);
  await q("mensagens recebidas por conexão (últimas 6 h)", `SELECT t."whatsappId" AS wa, COUNT(*) AS n, MAX(m."createdAt") AS ultima FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE m."fromMe" = false AND m."createdAt" > now() - interval '6 hours' GROUP BY 1`);
  await q("mensagens enviadas pelo sistema (OutboundMessages, 6 h)", `SELECT status, COUNT(*) AS n, MAX("createdAt") AS ultima FROM "OutboundMessages" WHERE "createdAt" > now() - interval '6 hours' GROUP BY 1`);
  await q("últimas enviadas com erro", `SELECT id, "ticketId", status, left(COALESCE(error,''), 160) AS erro, "createdAt" FROM "OutboundMessages" WHERE status <> 'sent' AND "createdAt" > now() - interval '6 hours' ORDER BY id DESC LIMIT 8`);
  await q("erros de tela (ClientErrors, 6 h)", `SELECT route, code, left(message, 200) AS mensagem, count(*) AS n, max("createdAt") AS ultima FROM "ClientErrors" WHERE "createdAt" > now() - interval '6 hours' GROUP BY 1,2,3 ORDER BY n DESC LIMIT 15`);
  await q("mensagens por hora e conexão (últimas 20 h, hora UTC)", `SELECT t."whatsappId" AS wa, to_char(date_trunc('hour', m."createdAt"), 'DD HH24"h"') AS hora, COUNT(*) FILTER (WHERE m."fromMe" = false) AS recebidas, COUNT(*) FILTER (WHERE m."fromMe" = true) AS enviadas FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE m."createdAt" > now() - interval '20 hours' GROUP BY 1, date_trunc('hour', m."createdAt") ORDER BY 1, date_trunc('hour', m."createdAt")`);
  await q("conexões (estado agora)", `SELECT id, name, status, "statusSince", "connectedSince" FROM "Whatsapps" ORDER BY id`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
