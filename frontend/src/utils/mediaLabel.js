// What a message with a file says when nobody wrote a caption: "📷 Imagem", "🎤 Áudio", "🎥 Vídeo", "Figurinha" — never the name of the file.
// (The server already stores these labels; this also covers the messages that were stored with the name of the file.)
const LABELS = { image: "📷 Imagem", video: "🎥 Vídeo", audio: "🎤 Áudio", ptt: "🎤 Áudio", sticker: "Figurinha" };
const FILE_NAME = /^[^\s\\/]{1,160}\.(jpe?g|png|gif|webp|bmp|heic|mp4|mov|3gp|avi|mkv|webm|ogg|oga|opus|mp3|m4a|aac|wav|amr)$/i;
const OLD_LABEL = /^[\p{Extended_Pictographic}\s]*(Foto|Mensagem de voz)$/u;

export const looksLikeFileName = (text, mediaUrl) => {
  const t = String(text || "").trim();
  if (!t) return false;
  const base = String(mediaUrl || "").split("?")[0].split("/").pop();
  return (!!base && t === base) || FILE_NAME.test(t);
};

// "sticker" when it is an image that travels as .webp
export const kindOfMedia = (type, url) => (type === "image" && /\.webp(\?|$)/i.test(String(url || "")) ? "sticker" : type);

// the label of the kind (empty for text and documents)
export const labelOfKind = (type, url) => LABELS[kindOfMedia(type, url)] || "";

// the text to show for a message or a last message: the caption, or the label when the text is only a file name
export const shownText = (body, type, url) => {
  const label = labelOfKind(type, url);
  if (!label) return String(body || "");
  const text = String(body || "").trim();
  return !text || looksLikeFileName(text, url) || OLD_LABEL.test(text) ? label : text;
};
