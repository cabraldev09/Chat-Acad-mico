import { toPng } from "html-to-image";

// Pictures that go to the WhatsApp groups. Drawn at a fixed width and exported at 3x, so the text stays sharp when the
// phone zooms in (1 800 px for a 600 px card).
export const renderPng = async (node, width, pixelRatio = 3) => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return toPng(node, { pixelRatio, cacheBust: true, backgroundColor: "#ffffff", style: { transform: "none", margin: "0" }, width, height: node.offsetHeight });
};

const toBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

export const downloadPng = (dataUrl, name) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
};

// puts the picture on the clipboard: paste it straight into WhatsApp Web
export const copyPng = async (dataUrl) => {
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error("clipboard-unsupported");
  await navigator.clipboard.write([new window.ClipboardItem({ "image/png": await toBlob(dataUrl) })]);
};

// phone: opens the share sheet with the picture (WhatsApp is one tap away). Returns false when the browser cannot.
export const sharePng = async (dataUrl, name, text) => {
  const file = new File([await toBlob(dataUrl)], name, { type: "image/png" });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], text });
  return true;
};

export const brDecimal = (n, digits = 2) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
