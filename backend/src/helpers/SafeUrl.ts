import dns from "dns";
import net from "net";

const isPrivate = (ip: string): boolean => {
  if (net.isIPv6(ip)) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};

// A URL the server may call on someone's behalf: http(s) to a public address (no loopback, LAN or cloud metadata).
// The e2e suite sets ALLOW_PRIVATE_URLS=true to call local mocks.
export const isUrlSafe = async (url: string): Promise<boolean> => {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    if (process.env.ALLOW_PRIVATE_URLS === "true") return true;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const addresses = net.isIP(host) ? [host] : (await dns.promises.lookup(host, { all: true })).map(a => a.address);
    return addresses.length > 0 && addresses.every(a => !isPrivate(a));
  } catch (e) {
    return false;
  }
};
