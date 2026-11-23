import JSZip from "jszip";
import path from "path";
import AppError from "../../errors/AppError";

export const MAX_TRAIN_ZIP_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_TRAIN_ZIP_ENTRIES = 5000;
export const isAllowedTrainingUpload = (name: string): boolean => [".pdf", ".docx", ".txt", ".zip"].includes(path.extname(name).toLowerCase());

export const textOfZip = async (buffer: Buffer, maxBytes = MAX_TRAIN_ZIP_TEXT_BYTES): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_TRAIN_ZIP_ENTRIES) throw new AppError("ERR_FILE_TOO_LARGE", 413);
  const names = entries.filter(f => !f.dir && /\.txt$/i.test(f.name) && !/^__MACOSX\//.test(f.name)).map(f => f.name);
  if (!names.length) throw new AppError("ERR_TRAIN_ZIP_EMPTY");
  names.sort((a, b) => (/_chat\.txt$/i.test(b) ? 1 : 0) - (/_chat\.txt$/i.test(a) ? 1 : 0) || a.length - b.length);
  const stream = zip.files[names[0]].nodeStream("nodebuffer") as any;
  const chunks: Buffer[] = [];
  let size = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    stream.on("data", (value: Buffer | Uint8Array) => {
      if (settled) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        stream.destroy();
        reject(new AppError("ERR_FILE_TOO_LARGE", 413));
        return;
      }
      chunks.push(chunk);
    });
    stream.once("error", (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    stream.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size).toString("utf8"));
    });
  });
};
