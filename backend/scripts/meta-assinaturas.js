// Read-only: which apps the Meta delivers the WhatsApp messages of the official number's account to (subscribed_apps), and which app issued
// the saved token. A refused delivery ("signature mismatch") means the app that signs the message is not the one whose App Secret is saved.
// Prints only public ids, app names and the callback address; never a token or a secret. Changes nothing.
require("/app/backend/dist/database");
const axios = require("axios");
const Whatsapp = require("/app/backend/dist/models/Whatsapp").default;
const { getConfig } = require("/app/backend/dist/channels/types");
const { GRAPH } = require("/app/backend/dist/channels/meta");
const { wabaOf } = require("/app/backend/dist/services/CampaignServices/Templates");

(async () => {
  const all = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } });
  if (!all.length) throw new Error("nenhuma conexão da API oficial");
  for (const w of all) {
    const cfg = getConfig(w);
    console.log(`conexão ${w.id} (${w.name}): App ID salvo = ${cfg.appId || "(vazio)"}; Phone Number ID = ${cfg.phoneNumberId || "(vazio)"}`);
    if (!cfg.accessToken) { console.log("  sem token salvo"); continue; }
    try {
      const { data: { data: info = {} } = {} } = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: cfg.accessToken, access_token: cfg.accessToken }, timeout: 20000 });
      console.log(`  token emitido pelo app "${info.application || "?"}" (App ID ${info.app_id || "?"})`);
    } catch (err) {
      console.log(`  a Meta não leu o token: ${err?.response?.data?.error?.message || err.message}`);
    }
    // the number can have an address of its own that wins over the app's (webhook_configuration): a leftover from another server keeps the messages away
    try {
      const { data } = await axios.get(`${GRAPH}/${cfg.phoneNumberId}`, { params: { fields: "display_phone_number,webhook_configuration", access_token: cfg.accessToken }, timeout: 20000 });
      const wc = data?.webhook_configuration || {};
      console.log(`  número ${data?.display_phone_number || "?"}: endereço próprio do número = ${wc.phone_number || "(nenhum)"}; da conta = ${wc.whatsapp_business_account || "(nenhum)"}; do app = ${wc.application || "(nenhum)"}`);
    } catch (err) {
      console.log(`  a Meta não leu o endereço do número: ${err?.response?.data?.error?.message || err.message}`);
    }
    let wabas = [];
    try { wabas = await wabaOf(cfg.accessToken, cfg.wabaId); } catch (err) { console.log(`  não achei a conta do WhatsApp: ${err.message}`); }
    for (const waba of wabas) {
      console.log(`  conta do WhatsApp ${waba}:`);
      try {
        const { data } = await axios.get(`${GRAPH}/${waba}/subscribed_apps`, { params: { access_token: cfg.accessToken }, timeout: 20000 });
        const apps = data?.data || [];
        if (!apps.length) console.log("    nenhum app assinado: a Meta não entrega nada desta conta");
        for (const a of apps) {
          const d = a.whatsapp_business_api_data || a;
          console.log(`    app "${d.name || "?"}" (App ID ${d.id || "?"})${a.override_callback_uri ? `; endereço próprio da conta: ${a.override_callback_uri}` : "; usa o endereço do app"}${String(d.id) === String(cfg.appId) ? " <- é o App ID salvo na conexão" : " <- DIFERENTE do App ID salvo na conexão"}`);
        }
      } catch (err) {
        console.log(`    a Meta não leu as assinaturas: ${err?.response?.data?.error?.message || err.message}`);
      }
    }
  }
  process.exit(0);
})().catch(err => { console.error(err.message || err); process.exit(1); });
