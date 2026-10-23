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
  await q("tarefas em aberto vencidas", `SELECT k.id, k.title, k."userId" AS task_user, l.name AS lead, l."ownerId" AS lead_owner, t.status AS t_status, t."userId" AS t_user, w."ownerId" AS wa_owner
    FROM "LeadTasks" k LEFT JOIN "Leads" l ON l.id = k."leadId"
    LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."leadId" = l.id ORDER BY t2.id DESC LIMIT 1)
    LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
    WHERE k."doneAt" IS NULL AND k."dueAt" < now() ORDER BY k."dueAt" LIMIT 40`);
  await q("1º contato (últimos 30 dias) por responsável", `SELECT COALESCE(t."userId", l."ownerId") AS resp, COUNT(*) AS n FROM "Leads" l LEFT JOIN "Tickets" t ON t.id = (SELECT t2.id FROM "Tickets" t2 WHERE t2."leadId" = l.id ORDER BY t2.id DESC LIMIT 1)
    WHERE l."firstContactAt" IS NOT NULL AND l."createdAt" > now() - interval '30 days' GROUP BY 1`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
