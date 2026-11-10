import { Request, Response, NextFunction } from "express";
import { verifyFileToken } from "../helpers/SignedFile";
import { publicFile } from "../helpers/PublicFile";
import { getSetting } from "../helpers/AppSettings";
import Message from "../models/Message";

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filename = decodeURIComponent(req.path.replace(/^\//, ""));
    publicFile(filename);
    const claims = verifyFileToken(String(req.query.access || ""), filename);
    if (await getSetting(`file_revoked_${filename}`, "false") === "true") throw new Error("Revoked file");
    if (claims.messageId) {
      const message = await Message.findByPk(claims.messageId);
      if (!message || message.isDeleted || message.getDataValue("mediaUrl") !== filename) throw new Error("Deleted file");
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  } catch (_) { res.status(403).json({ error: "ERR_FILE_ACCESS_EXPIRED" }); }
};
