export const OPERATION_DEFAULTS: Record<string, string> = {
  crm_sla_minutes: "15", crm_escalation_minutes: "30", crm_fallback_queue_id: "0",
  crm_followup_enabled: "true", crm_proposal_unopened_minutes: "120", crm_proposal_viewed_minutes: "60", crm_payment_followup_minutes: "120",
  ai_daily_token_cap: "0", ai_daily_usd_cap: "0", outbound_daily_messages: "0", outbound_daily_usd: "0",
  outbound_allow_templates: "false", outbound_meta_service_usd: "", outbound_meta_template_usd: ""
};
export const FINANCIAL_KEYS = Object.keys(OPERATION_DEFAULTS).filter(k => k.startsWith("ai_") || k.startsWith("outbound_"));
export const validateOperationSetting = (key: string, value: unknown): string => {
  if (!Object.hasOwnProperty.call(OPERATION_DEFAULTS, key)) throw new Error("ERR_OPERATION_SETTING");
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error("ERR_OPERATION_SETTING");
  const text = String(value);
  if (["crm_followup_enabled", "outbound_allow_templates"].includes(key)) {
    if (!["true", "false"].includes(text)) throw new Error("ERR_OPERATION_SETTING");
  } else if (!(text === "" && key.includes("meta_"))) {
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 1000000000) throw new Error("ERR_OPERATION_SETTING");
    if (!key.includes("usd") && !Number.isInteger(n)) throw new Error("ERR_OPERATION_SETTING");
  }
  return text;
};
