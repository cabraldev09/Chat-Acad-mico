import { safeRequest } from "../../helpers/SafeUrl";

// The card of a link in the conversation (as on WhatsApp): the title, a line of the page and its picture, read from the page's
// og:/twitter: tags. Only public addresses (SafeUrl: no internal network, checked again at connection time), at most 3 redirects,
// 4 s and 512 KB; kept 6 h in memory. A page that does not answer, or has nothing to show, gives null (the message stays as text).
export interface LinkCard { url: string; title: string; description: string; image: string | null; site: string }

const cache = new Map<string, { at: number; card: LinkCard | null }>();
const TTL = 6 * 3600000;
const MAX = 500;

const decode = (v: string): string =>
  v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();

export const parseCard = (html: string, url: string): LinkCard | null => {
  const head = html.slice(0, 300000);
  const meta = (names: string[]): string => {
    for (const name of names) {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
      const tag = head.match(re)?.[0];
      const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
      if (content) return decode(content);
    }
    return "";
  };
  const title = (meta(["og:title", "twitter:title"]) || decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "")).slice(0, 160);
  const description = meta(["og:description", "twitter:description", "description"]).slice(0, 240);
  let image: string | null = meta(["og:image:secure_url", "og:image", "twitter:image"]) || null;
  if (image) {
    try {
      const abs = new URL(image, url);
      image = ["http:", "https:"].includes(abs.protocol) ? abs.toString() : null;
    } catch (_) { image = null; }
  }
  const site = meta(["og:site_name"]) || new URL(url).hostname.replace(/^www\./, "");
  if (!title && !image) return null;
  return { url, title, description, image, site };
};

export const linkPreview = async (raw: string): Promise<LinkCard | null> => {
  let url: string;
  try {
    const u = new URL(String(raw || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return null;
    url = u.toString();
  } catch (_) { return null; }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.card;
  let card: LinkCard | null = null;
  try {
    let current = url;
    for (let hop = 0; hop <= 3; hop += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await safeRequest({
        url: current, method: "GET", timeout: 4000, maxContentLength: 512 * 1024, responseType: "text", validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatAcademicoBot/1.0)", Accept: "text/html,application/xhtml+xml" }
      });
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        current = new URL(String(res.headers.location), current).toString();
        continue;
      }
      if (res.status >= 200 && res.status < 300 && /html/i.test(String(res.headers["content-type"] || "text/html"))) card = parseCard(String(res.data || ""), current);
      break;
    }
  } catch (_) {
    card = null;
  }
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(url, { at: Date.now(), card });
  return card;
};
