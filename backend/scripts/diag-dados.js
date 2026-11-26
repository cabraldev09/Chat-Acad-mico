// Read-only: who is "responsible" for each new lead and open task, and why (lead owner, conversation owner, WhatsApp connection owner).
const sequelize = require("/app/backend/dist/database").default;
const q = async (title, sql) => {
  const [rows] = await sequelize.query(sql);
  console.log("== " + title + " ==");
  rows.forEach(r => console.log(JSON.stringify(r)));
};
(async () => {
  // Repositório público: só contagens e situações, nunca nome, telefone, polo ou trecho de conversa.
  // Leitura das conversas copiadas e Recuperação (só números)
  await q("leituras da cópia por situação", `SELECT status, COALESCE("doneBy",'-') AS feito_por, left(COALESCE(error,''), 80) AS erro, COUNT(*) AS n FROM "ConversationReadings" WHERE kind = 'importacao' GROUP BY 1,2,3 ORDER BY 4 DESC`);
  await q("resultado das leituras feitas", `SELECT COALESCE(result->>'action','-') AS acao, COUNT(*) AS n FROM "ConversationReadings" WHERE kind = 'importacao' AND status = 'feita' GROUP BY 1 ORDER BY 2 DESC`);
  await q("leituras por situação (todas)", `SELECT kind, status, COUNT(*) AS n FROM "ConversationReadings" GROUP BY 1,2 ORDER BY 1,2`);
  await q("números QR (dono, cópia)", `SELECT id, status, ("ownerId" IS NOT NULL) AS tem_dono, "historyImportedAt" IS NOT NULL AS copiado, to_char("historyImportedAt", 'DD/MM HH24:MI') AS quando, "historyReport" FROM "Whatsapps" WHERE channel = 'whatsapp' ORDER BY id`);
  await q("conversas copiadas por número", `SELECT t."whatsappId" AS wa, COUNT(*) AS conversas, COUNT(*) FILTER (WHERE t."lastMessageAt" > now() - interval '90 days') AS ultimos_90, COUNT(*) FILTER (WHERE t."isGroup") AS grupos FROM "Tickets" t WHERE t."isHistorical" = true GROUP BY 1 ORDER BY 1`);
  await q("configurações da leitura", `SELECT key, value FROM "Settings" WHERE key LIKE 'readings_%' OR key IN ('whatsapp_copy_enabled')`);
  await q("leads na recuperação", `SELECT "recoveryState", ("poloId" IS NULL) AS sem_polo, COUNT(*) AS n FROM "Leads" WHERE "recoveryState" IS NOT NULL GROUP BY 1,2`);
  await q("agentes de IA", `SELECT id, provider, active, ("apiKey" IS NOT NULL AND "apiKey" <> '') AS chave_propria FROM "AiAgents" ORDER BY id`);
  try {
    const { auditorAccess } = require("/app/backend/dist/services/TutoriaServices/Issues");
    const a = await auditorAccess();
    console.log("\n== a leitura acha uma chave de IA?\n" + JSON.stringify({ chave: !!a, provedor: a ? a.agent.provider : null }));
  } catch (e) { console.log("auditorAccess: " + e.message); }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
