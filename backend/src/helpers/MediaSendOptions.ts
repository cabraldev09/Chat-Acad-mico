// the options of the send by the file and by how the person asked it to go; a .webp image that is not a sticker still goes as a file
export const mediaOptionsOf = (
  media: { mimetype: string; filename: string },
  kind?: "sticker" | "gif"
): { sendMediaAsDocument: boolean; sendMediaAsSticker?: boolean; sendVideoAsGif?: boolean } => {
  if (kind === "sticker" && media.mimetype.startsWith("image/")) return { sendMediaAsDocument: false, sendMediaAsSticker: true };
  if (kind === "gif" && media.mimetype.startsWith("video/")) return { sendMediaAsDocument: false, sendVideoAsGif: true };
  return { sendMediaAsDocument: media.mimetype.startsWith("image/") && !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename) };
};
