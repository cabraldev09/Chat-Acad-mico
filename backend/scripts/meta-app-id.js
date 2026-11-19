// Fills the App ID of an official number with the app that issued its own token (read on the Meta with debug_token), saves the WhatsApp
// account (WABA) id, and tries the trade for the 60-day token right away. Prints only public ids and the result: never a token or a secret.
require("/app/backend/dist/database");
const axios = require("axios");
const Whatsapp = require("/app/backend/dist/models/Whatsapp").default;
const { getConfig } = require("/app/backend/dist/channels/types");
const { GRAPH } = require("/app/backend/dist/channels/meta");
const { saveConfig, extendCloudToken } = require("/app/backend/dist/services/ChannelServices/CloudToken");

const PHONE = String(process.env.PHONE_ID || "").replace(/\D/g, "");
const WABA = String(process.env.WABA_ID || "").replace(/\D/g, "");
(async () => {
  const all = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } });
  const list = all.filter(w => !PHONE || String(getConfig(w).phoneNumberId || "").replace(/\D/g, "") === PHONE);
  if (!list.length) throw new Error(`nenhuma conexão da API oficial com o Phone Number ID ${PHONE}`);
  for (const w of list) {
    const cfg = getConfig(w);
    console.log(`conexão ${w.id} (${w.name}): App ID salvo antes = ${cfg.appId || "(vazio)"}`);
    if (!cfg.accessToken) { console.log("  sem token salvo: cole o token em Conexões"); continue; }
    let info = {};
    try {
      ({ data: { data: info = {} } = {} } = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: cfg.accessToken, access_token: cfg.accessToken }, timeout: 20000 }));
    } catch (err) {
      console.log(`  a Meta não leu o token: ${err?.response?.data?.error?.message || err.message}`);
      continue;
    }
    const expires = Number(info.expires_at || 0);
    console.log(`  token do app "${info.application || "?"}" (App ID ${info.app_id || "?"}), válido: ${info.is_valid ? "sim" : "não"}, vence: ${expires ? new Date(expires * 1000).toISOString() : "nunca (permanente)"}`);
    if (!info.app_id) continue;
    await saveConfig(w, { appId: String(info.app_id), ...(WABA ? { wabaId: WABA } : {}), tokenExtendError: null });
    await w.reload();
    const result = await extendCloudToken(w);
    await w.reload();
    const after = getConfig(w);
    console.log(`  App ID gravado = ${after.appId}; WABA = ${after.wabaId || "(vazio)"}; troca do token: ${result}; vence agora: ${after.tokenExpiresAt || (result === "permanent" ? "nunca" : "?")}${after.tokenExtendError ? `; aviso: ${after.tokenExtendError}` : ""}`);
  }
  process.exit(0);
})().catch(err => { console.error(err.message || err); process.exit(1); });
