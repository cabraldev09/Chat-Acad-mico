import api from "./api";

export const refreshMediaUrl = async (url) => {
  try {
    const token = new URL(url, window.location.origin).searchParams.get("access");
    if (!token) return url;
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(window.atob(part));
    if (!claims.messageId) return url;
    const { data } = await api.get(`/files/messages/${encodeURIComponent(claims.messageId)}/link`);
    return data.url;
  } catch (_) { return url; }
};
export const renewMediaElement = async (event) => {
  const element = event.currentTarget;
  if (element.dataset.renewing === "true") return;
  element.dataset.renewing = "true";
  const url = await refreshMediaUrl(element.src);
  if (url !== element.src) { element.src = url; element.load?.(); }
};
