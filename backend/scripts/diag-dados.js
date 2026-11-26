// Read-only: who is "responsible" for each new lead and open task, and why (lead owner, conversation owner, WhatsApp connection owner).
const sequelize = require("/app/backend/dist/database").default;
const q = async (title, sql) => {
  const [rows] = await sequelize.query(sql);
  console.log("== " + title + " ==");
  rows.forEach(r => console.log(JSON.stringify(r)));
};
(async () => {
  // Repositório público: só contagens e situações, nunca nome, telefone, polo ou trecho de conversa.
  // Figurinhas enviadas pela equipe nas últimas 6 h: tipo, tique e se a lista aponta para ela (só ids e códigos)
  await q("figurinhas enviadas (6 h)", `SELECT m."ticketId" AS conversa, m."mediaType" AS tipo, right(COALESCE(m."mediaUrl",''), 5) AS ext, m.ack AS tique_msg,
      (t."lastMessageId" = m.id) AS lista_aponta, t."lastMessageAck" AS tique_lista, t."lastMessageType" AS tipo_lista, (left(m.id, 6) = 'true_') AS id_web,
      to_char(m."createdAt" AT TIME ZONE 'America/Porto_Velho', 'HH24:MI') AS hora
    FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId"
    WHERE m."fromMe" = true AND m."createdAt" > NOW() - INTERVAL '6 hours' AND (m."mediaType" = 'sticker' OR m."mediaUrl" ILIKE '%.webp%')
    ORDER BY m."createdAt" DESC LIMIT 15`);
  await q("mensagens da mesma conversa logo depois da figurinha (mesmo minuto)", `SELECT m2."ticketId" AS conversa, m2."mediaType" AS tipo, m2.ack AS tique, (left(m2.id, 6) = 'true_') AS id_web, length(m2.id) AS tam_id
    FROM "Messages" m JOIN "Messages" m2 ON m2."ticketId" = m."ticketId" AND m2."fromMe" = true AND m2."createdAt" BETWEEN m."createdAt" - INTERVAL '1 minute' AND m."createdAt" + INTERVAL '1 minute'
    WHERE m."fromMe" = true AND m."createdAt" > NOW() - INTERVAL '6 hours' AND m."mediaUrl" ILIKE '%.webp%' ORDER BY m2."createdAt" DESC LIMIT 20`);
  await q("envios pela fila com figurinha, 6 h (a mensagem com o id do envio existe? a lista aponta para ela?)", `SELECT o.status, o."ticketId" AS conversa, regexp_replace(left(COALESCE(o.error,''), 60), '[0-9]{6,}', '#', 'g') AS erro,
      (m.id IS NOT NULL) AS msg_existe, m.ack AS tique_msg, (t."lastMessageId" = o."providerMsgId") AS lista_aponta, t."lastMessageAck" AS tique_lista,
      to_char(o."createdAt" AT TIME ZONE 'America/Porto_Velho', 'HH24:MI') AS hora
    FROM "OutboundMessages" o LEFT JOIN "Messages" m ON m.id = o."providerMsgId" JOIN "Tickets" t ON t.id = o."ticketId"
    WHERE o."createdAt" > NOW() - INTERVAL '6 hours' AND o.payload::text ILIKE '%sticker%' ORDER BY o."createdAt" DESC LIMIT 15`).catch(e => console.log("outbound: " + e.message));
  // Leitura das conversas copiadas e Recuperação (só números)
  await q("leituras da cópia por situação", `SELECT status, COALESCE("doneBy",'-') AS feito_por, regexp_replace(left(COALESCE(error,''), 80), '[0-9]{6,}', '#', 'g') AS erro, COUNT(*) AS n FROM "ConversationReadings" WHERE kind = 'importacao' GROUP BY 1,2,3 ORDER BY 4 DESC`);
  await q("resultado das leituras feitas", `SELECT COALESCE(result::jsonb->>'action','-') AS acao, COUNT(*) AS n FROM "ConversationReadings" WHERE kind = 'importacao' AND status = 'feita' GROUP BY 1 ORDER BY 2 DESC`);
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
