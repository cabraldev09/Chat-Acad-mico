// What a message with a file says when nobody wrote a caption: a short label ("📷 Imagem", "🎤 Áudio", "🎥 Vídeo", "Figurinha"), never the name of the file.
// Documents keep their own file name (it is what identifies them).
export const MEDIA_LABELS: Record<string, string> = { image: "📷 Imagem", video: "🎥 Vídeo", audio: "🎤 Áudio", sticker: "Figurinha" };

const FILE_NAME = /^[^\s\\/]{1,160}\.(jpe?g|png|gif|webp|bmp|heic|mp4|mov|3gp|avi|mkv|webm|ogg|oga|opus|mp3|m4a|aac|wav|amr)$/i;

// the text is only the name of the file (the same as the stored one, or one that looks like a name made by the system)
export const looksLikeFileName = (text?: string | null, mediaUrl?: string | null): boolean => {
  const t = String(text || "").trim();
  if (!t) return false;
  const base = String(mediaUrl || "").split("?")[0].split("/").pop();
  return (!!base && t === base) || FILE_NAME.test(t);
};

// a sticker travels as a .webp image
export const kindOf = (mediaType?: string | null, mediaUrl?: string | null, mimetype?: string | null): string => {
  const type = mediaType === "ptt" ? "audio" : String(mediaType || "chat");
  const webp = /\.webp(\?|$)/i.test(String(mediaUrl || "")) || /webp/i.test(String(mimetype || ""));
  return type === "image" && webp ? "sticker" : type;
};

// the text of a message that carries a file: the caption when there is one, else the label of its kind (a document keeps its name)
export const bodyOfMedia = (caption: string | null | undefined, mediaType: string | null | undefined, mediaUrl: string | null | undefined, fileName?: string | null, mimetype?: string | null): string => {
  const text = String(caption || "").trim();
  if (text && !looksLikeFileName(text, mediaUrl)) return caption as string;
  const label = MEDIA_LABELS[kindOf(mediaType, mediaUrl, mimetype)];
  return label || String(fileName || mediaUrl || text || "");
};

// the text is only one of the labels above (or one of the older ones): there is no caption
export const isMediaLabel = (text?: string | null): boolean => /^[\p{Extended_Pictographic}\s]*(Imagem|Foto|Vídeo|Áudio|Mensagem de voz|Figurinha)$/u.test(String(text || "").replace(/‎/g, "").trim());
