import dns from "dns";
import net from "net";
import http from "http";
import https from "https";
import axios, { AxiosRequestConfig } from "axios";
import ipaddr from "ipaddr.js";

const allowPrivate = () => process.env.ALLOW_PRIVATE_URLS === "true" && process.env.NODE_ENV !== "production";
export const isPublicAddress = (ip: string): boolean => {
  try { return ipaddr.process(ip).range() === "unicast"; } catch (_) { return false; }
};
const addressesOf = async (host: string) => {
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.promises.lookup(host, { all: true });
  if (!addresses.length || (!allowPrivate() && addresses.some(a => !isPublicAddress(a.address)))) throw new Error("Unsafe destination");
  return addresses;
};
export const isUrlSafe = async (url: string): Promise<boolean> => {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return false;
    await addressesOf(u.hostname.replace(/^\[|\]$/g, ""));
    return true;
  } catch (_) { return false; }
};
// Resolve and validate again at connection time to prevent DNS rebinding.
const lookup = (host: string, options: any, callback: any) => {
  addressesOf(host).then(addresses => options?.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family)).catch(callback);
};
const httpAgent = new http.Agent({ lookup: lookup as any });
const httpsAgent = new https.Agent({ lookup: lookup as any });
export const safeRequest = async (config: AxiosRequestConfig) => {
  if (!(await isUrlSafe(String(config.url || "")))) throw new Error("Unsafe destination");
  // Redirects must not cross the validation boundary or forward credentials.
  return axios.request({ ...config, maxRedirects: 0, httpAgent, httpsAgent, proxy: false });
};
