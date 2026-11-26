// The address shown in the API documentation screens. It is a public text (copied into other systems, shown in screenshots): it shows
// the public domain configured for the API, never the address of the server itself (an IP, or a name that only spells an IP such as
// sslip.io / nip.io). Without a public domain the documentation shows a generic marker.
export const API_ADDRESS_MARKER = "https://SEU-DOMINIO-DA-API";

const IP_NAME = /(^|\.)(sslip\.io|nip\.io|xip\.io|traefik\.me)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const DASHED_IP = /(^|[.-])\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}([.-]|$)/;

export const publicApiBase = (configured) => {
  let url;
  try { url = new URL(String(configured || "")); } catch (_) { return API_ADDRESS_MARKER; }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || IPV4.test(host) || host.includes(":") || IP_NAME.test(host) || DASHED_IP.test(host)) return API_ADDRESS_MARKER;
  return `${url.protocol}//${url.host}`;
};
