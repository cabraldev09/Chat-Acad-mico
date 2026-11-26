import { QueryInterface, QueryTypes } from "sequelize";

// The qualification bot of the SESTED, installed once and published: the queue "Comercial SESTED" (empty: the management puts the SESTED
// consultants in it, in Filas), the tag "SESTED" and the flow by the keyword "SESTED" on the official number of the commercial team.
// Only where the SESTED university exists; a flow with the same name is never touched (it may have been edited on the screen).
module.exports = {
  up: async (q: QueryInterface) => {
    const db = q.sequelize;
    if (db.getDialect() !== "postgres") return;
    const select = (sql: string, replacements: any = {}) => db.query(sql, { type: QueryTypes.SELECT, replacements }) as Promise<any[]>;
    const [inst] = await select(`SELECT id FROM "Institutions" WHERE name ~* 'sested|sistema de ensino superior tecnol' OR "shortName" ~* 'sested' ORDER BY id LIMIT 1`);
    if (!inst) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sestedGraph, SESTED_FLOW_NAME, SESTED_KEYWORDS } = require("../../services/FlowServices/SestedBot");
    if ((await select(`SELECT id FROM "ChatFlows" WHERE name = :name`, { name: SESTED_FLOW_NAME })).length) return;
    let [queue] = await select(`SELECT id FROM "Queues" WHERE name = 'Comercial SESTED' LIMIT 1`);
    if (!queue) [queue] = await select(`INSERT INTO "Queues" (name, color, "autoAssign", "createdAt", "updatedAt") VALUES ('Comercial SESTED', '#7c3aed', 'none', NOW(), NOW()) RETURNING id`);
    let [tag] = await select(`SELECT id FROM "Tags" WHERE lower(name) = 'sested' LIMIT 1`);
    if (!tag) [tag] = await select(`INSERT INTO "Tags" (name, color, "createdAt", "updatedAt") VALUES ('SESTED', '#7c3aed', NOW(), NOW()) RETURNING id`);
    // the official number of the commercial team (not the tutoring, not the relationship one, not somebody's own number)
    const [cloud] = await select(`SELECT id FROM "Whatsapps" WHERE channel = 'whatsapp_cloud' AND "ownerId" IS NULL AND COALESCE(team, '') NOT IN ('tutoria', 'relacionamento') ORDER BY "isDefault" DESC, id ASC LIMIT 1`);
    const graph = JSON.stringify(sestedGraph({ institutionId: inst.id, queueId: queue.id, tagId: tag.id }));
    await select(
      `INSERT INTO "ChatFlows" (name, description, "whatsappId", status, entry, draft, published, version, "publishedAt", kind, "createdAt", "updatedAt")
       VALUES (:name, :description, :wa, 'published', :entry, :graph, :graph, 1, NOW(), 'flow', NOW(), NOW()) RETURNING id`,
      {
        name: SESTED_FLOW_NAME,
        description: "Qualifica com botões quem procura os cursos da SESTED e passa ao próximo consultor da fila Comercial SESTED.",
        wa: cloud ? cloud.id : null,
        entry: JSON.stringify({ type: "keyword", keywords: SESTED_KEYWORDS }),
        graph
      }
    );
  },
  down: async () => undefined
};
