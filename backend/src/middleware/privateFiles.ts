import { Request, Response, NextFunction } from "express";
import { verifyFileToken } from "../helpers/SignedFile";
import { publicFile } from "../helpers/PublicFile";
import { getSetting } from "../helpers/AppSettings";
import Message from "../models/Message";

export default async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filename = decodeURIComponent(req.path.replace(/^\//, ""));
    publicFile(filename, true, { allowAvatar: true });
    const claims = verifyFileToken(String(req.query.access || ""), filename);
    if (await getSetting(`file_revoked_${filename}`, "false") === "true") throw new Error("Revoked file");
    if (claims.messageId) {
      const message = await Message.findByPk(claims.messageId);
      if (!message || message.isDeleted || message.getDataValue("mediaUrl") !== filename) throw new Error("Deleted file");
    }
    // the same link serves the same file for the hour: the browser may keep it a few minutes instead of downloading it on every
    // refresh of the conversation (private: never in a shared cache)
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  } catch (_) { res.status(403).json({ error: "ERR_FILE_ACCESS_EXPIRED" }); }
};
