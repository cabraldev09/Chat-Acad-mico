import { signedFileUrl } from "./SignedFile";
// Pictures saved on our side are stored as a relative path; this turns it into the address the browser opens.
export const publicPicUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  return signedFileUrl(raw);
};

export const isLocalPic = (raw?: string | null): boolean => !!raw && !/^https?:\/\//.test(raw);
