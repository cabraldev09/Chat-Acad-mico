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
  await q("tarefas vencidas, com a conversa aberta do contato", `SELECT k.id, k.title, k."userId" AS task_user, l.name AS lead, l."ownerId" AS lead_owner, t.id AS ticket, t.status AS t_status, t."userId" AS t_user, t."whatsappId" AS t_wa
    FROM "LeadTasks" k JOIN "Leads" l ON l.id = k."leadId"
    LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."contactId" = l."contactId" AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
    WHERE k."doneAt" IS NULL AND k."dueAt" < now() ORDER BY k."dueAt" LIMIT 40`);
  await q("conversas abertas com quem não tem WhatsApp", `SELECT u.id AS user_id, u.name, t.status, COUNT(*) AS n FROM "Tickets" t JOIN "Users" u ON u.id = t."userId"
    WHERE t.status IN ('open','pending') AND t."isGroup" = false AND t."isHistorical" = false AND NOT EXISTS (SELECT 1 FROM "Whatsapps" w WHERE w.channel = 'whatsapp' AND w."ownerId" = u.id) GROUP BY 1,2,3 ORDER BY n DESC`);
  await q("mídias sem arquivo (24 h)", `SELECT t."whatsappId" AS wa, m."mediaType", COUNT(*) AS n, MAX(m."createdAt") AS ultima FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId"
    WHERE m."createdAt" > now() - interval '24 hours' AND m."mediaType" IS NOT NULL AND m."mediaType" <> 'chat' AND (m."mediaUrl" IS NULL OR m."mediaUrl" = '') GROUP BY 1,2 ORDER BY n DESC`);
  await q("1º contato (últimos 30 dias) por responsável", `SELECT COALESCE(t."userId", l."ownerId") AS resp, COUNT(*) AS n FROM "Leads" l LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."leadId" = l.id ORDER BY t2.id DESC LIMIT 1)
    WHERE l."firstContactAt" IS NOT NULL AND l."createdAt" > now() - interval '30 days' GROUP BY 1`);
  await q("mensagens recebidas por conexão (últimas 6 h)", `SELECT t."whatsappId" AS wa, COUNT(*) AS n, MAX(m."createdAt") AS ultima FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE m."fromMe" = false AND m."createdAt" > now() - interval '6 hours' GROUP BY 1`);
  await q("mensagens enviadas pelo sistema (OutboundMessages, 6 h)", `SELECT status, COUNT(*) AS n, MAX("createdAt") AS ultima FROM "OutboundMessages" WHERE "createdAt" > now() - interval '6 hours' GROUP BY 1`);
  await q("últimas enviadas com erro", `SELECT id, "ticketId", status, left(COALESCE(error,''), 160) AS erro, "createdAt" FROM "OutboundMessages" WHERE status <> 'sent' AND "createdAt" > now() - interval '6 hours' ORDER BY id DESC LIMIT 8`);
  await q("erros de tela (ClientErrors, 6 h)", `SELECT route, code, left(message, 200) AS mensagem, count(*) AS n, max("createdAt") AS ultima FROM "ClientErrors" WHERE "createdAt" > now() - interval '6 hours' GROUP BY 1,2,3 ORDER BY n DESC LIMIT 15`);
  await q("mensagens por hora e conexão (últimas 20 h, hora UTC)", `SELECT t."whatsappId" AS wa, to_char(date_trunc('hour', m."createdAt"), 'DD HH24"h"') AS hora, COUNT(*) FILTER (WHERE m."fromMe" = false) AS recebidas, COUNT(*) FILTER (WHERE m."fromMe" = true) AS enviadas FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE m."createdAt" > now() - interval '20 hours' GROUP BY 1, date_trunc('hour', m."createdAt") ORDER BY 1, date_trunc('hour', m."createdAt")`);
  await q("conexões (estado agora)", `SELECT id, name, status, "statusSince", "connectedSince" FROM "Whatsapps" ORDER BY id`);
  // only internal numbers: no name, no phone
  await q("contatos com mais de uma conversa de tutoria aberta", `SELECT t."contactId" AS contato, t.id AS ticket, t."whatsappId" AS wa, w.team AS wa_team, t.segment, t.status, t."userId" AS t_user, t."queueId" AS fila, t."leadId" AS t_lead,
      t."createdAt", (SELECT COUNT(*) FROM "Messages" m WHERE m."ticketId" = t.id) AS msgs,
      (SELECT string_agg(e.type || '@' || to_char(e."createdAt", 'DD HH24:MI'), ',' ORDER BY e.id) FROM "TicketEvents" e WHERE e."ticketId" = t.id) AS eventos
    FROM "Tickets" t LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE t.status IN ('open','pending') AND t."isGroup" = false AND t.segment IN ('onboarding','support')
      AND t."contactId" IN (SELECT t2."contactId" FROM "Tickets" t2 WHERE t2.status IN ('open','pending') AND t2."isGroup" = false AND t2.segment IN ('onboarding','support') GROUP BY 1 HAVING COUNT(*) > 1)
    ORDER BY t."contactId", t.id LIMIT 40`);
  // only internal numbers: the commercial side (segment empty or sales) with more than one conversation of the same person, and the
  // same telephone saved as more than one contact (with and without the 9, with and without 55)
  await q("conversas do comercial repetidas (mesmo contato)", `SELECT t."contactId" AS contato, t.id AS ticket, t."whatsappId" AS wa, w.channel, w.team AS wa_team, t.segment, t.status, t."userId" AS t_user,
      t."leadId" AS t_lead, t."isHistorical" AS hist, t."createdAt", (SELECT COUNT(*) FROM "Messages" m WHERE m."ticketId" = t.id) AS msgs,
      (SELECT string_agg(e.type || '@' || to_char(e."createdAt", 'DD HH24:MI'), ',' ORDER BY e.id) FROM "TicketEvents" e WHERE e."ticketId" = t.id) AS eventos
    FROM "Tickets" t LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE t."isGroup" = false AND COALESCE(t.segment, 'sales') NOT IN ('onboarding','support','relationship') AND t.status IN ('open','pending')
      AND t."contactId" IN (SELECT t2."contactId" FROM "Tickets" t2 WHERE t2."isGroup" = false AND t2.status IN ('open','pending') AND COALESCE(t2.segment, 'sales') NOT IN ('onboarding','support','relationship') GROUP BY 1 HAVING COUNT(*) > 1)
    ORDER BY t."contactId", t.id LIMIT 60`);
  await q("mesmo telefone em mais de um contato (com e sem o 9)", `WITH n AS (SELECT id, CASE WHEN length(d) = 13 AND substr(d, 5, 1) = '9' THEN substr(d, 1, 4) || substr(d, 6) WHEN length(d) = 11 AND substr(d, 3, 1) = '9' THEN '55' || substr(d, 1, 2) || substr(d, 4) WHEN length(d) = 10 THEN '55' || d ELSE d END AS k
      FROM (SELECT id, regexp_replace(number, '\\D', '', 'g') AS d FROM "Contacts" WHERE "isGroup" = false) x)
    SELECT k_count.n AS contatos, k_count.ids, (SELECT COUNT(*) FROM "Tickets" t WHERE t."contactId" = ANY(k_count.idarr) AND t.status IN ('open','pending')) AS conversas_abertas
    FROM (SELECT k, COUNT(*) AS n, string_agg(id::text, ',' ORDER BY id) AS ids, array_agg(id) AS idarr FROM n WHERE length(k) >= 12 GROUP BY k HAVING COUNT(*) > 1) k_count ORDER BY n DESC LIMIT 40`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
