// Sends the recommended WhatsApp templates (all Utility, never moved to Marketing) to the Meta through the official number's saved token,
// then lists every template of the account with its status and links the approved ones to their settings. Prints names and statuses only:
// never a token or a secret.
require("/app/backend/dist/database");
const { loadInstitution, institutionName } = require("/app/backend/dist/helpers/Institution");
const { sendTemplatePack, allTemplates, linkApproved } = require("/app/backend/dist/services/CampaignServices/Templates");

const ONLY_STATUS = process.env.SO_STATUS === "true";
(async () => {
  await loadInstitution();
  console.log(`instituição: ${institutionName()}`);
  if (!ONLY_STATUS) {
    const results = await sendTemplatePack(institutionName());
    for (const r of results) console.log(`envio  ${r.name}: ${r.result}`);
  }
  const templates = await allTemplates();
  for (const t of templates) console.log(`status ${t.name} [${t.category}] ${t.status}${t.reason ? ` (motivo: ${t.reason})` : ""}`);
  const linked = await linkApproved(institutionName(), templates);
  console.log(linked.length ? `ligados às configurações: ${linked.join(", ")}` : "nenhum modelo novo ligado às configurações");
  process.exit(0);
})().catch(err => {
  console.error(`erro: ${err.message}`);
  process.exit(1);
});
