export const inMessagingWindow = (channel: string, lastInbound: Date | null, now = Date.now()): boolean =>
  !["whatsapp_cloud", "instagram", "messenger"].includes(channel) ||
  (!!lastInbound && now >= lastInbound.getTime() && now - lastInbound.getTime() < 24 * 3600000);

export const validateTemplate = (t: { name: string; language: string; params: string[] }): boolean =>
  /^[a-z][a-z0-9_]{0,511}$/.test(t.name) && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(t.language) &&
  Array.isArray(t.params) && t.params.length <= 20 && t.params.every(p => typeof p === "string" && p.length <= 2000);
