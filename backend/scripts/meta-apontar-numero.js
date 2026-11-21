// Points the webhook address of each official number (webhook_configuration of the phone number, which wins over the app's) to this
// system: <PUBLIC_URL>/webhooks/meta/<connection id>, with the Verify Token of the connection. The Meta checks the address right away
// (GET with the Verify Token); if it does not answer, the Meta refuses and nothing changes. Prints only public ids and addresses.
require("/app/backend/dist/database");
const axios = require("axios");
const Whatsapp = require("/app/backend/dist/models/Whatsapp").default;
const { getConfig } = require("/app/backend/dist/channels/types");
const { GRAPH } = require("/app/backend/dist/channels/meta");
const { getPublicUrl } = require("/app/backend/dist/helpers/PublicUrl");

const numberAddress = async (cfg) => {
  const { data } = await axios.get(`${GRAPH}/${cfg.phoneNumberId}`, { params: { fields: "display_phone_number,webhook_configuration", access_token: cfg.accessToken }, timeout: 20000 });
  return { phone: data?.display_phone_number || "?", own: (data?.webhook_configuration || {}).phone_number || "" };
};

(async () => {
  const base = String(getPublicUrl() || "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error(`o endereço público do sistema não é https (${base || "vazio"})`);
  const all = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } });
  for (const w of all) {
    const cfg = getConfig(w);
    if (!cfg.accessToken || !cfg.phoneNumberId || !cfg.verifyToken) { console.log(`conexão ${w.id} (${w.name}): sem token, Phone Number ID ou Verify Token; nada feito`); continue; }
    const url = `${base}/webhooks/meta/${w.id}`;
    const before = await numberAddress(cfg);
    console.log(`conexão ${w.id} (${w.name}), número ${before.phone}: endereço próprio antes = ${before.own || "(nenhum)"}`);
    if (before.own === url) { console.log("  já aponta para este sistema; nada feito"); continue; }
    try {
      await axios.post(`${GRAPH}/${cfg.phoneNumberId}`, { webhook_configuration: { override_callback_uri: url, verify_token: cfg.verifyToken } }, { params: { access_token: cfg.accessToken }, timeout: 30000 });
    } catch (err) {
      console.log(`  a Meta recusou: ${err?.response?.data?.error?.message || err.message}`);
      continue;
    }
    const after = await numberAddress(cfg);
    console.log(`  endereço próprio depois = ${after.own || "(nenhum)"}${after.own === url ? "  <- aponta para este sistema" : ""}`);
  }
  process.exit(0);
})().catch(err => { console.error(err.message || err); process.exit(1); });
