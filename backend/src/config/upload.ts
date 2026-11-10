import path from "path";
import multer from "multer";
import { randomBytes } from "crypto";
import { PUBLIC_DIR } from "./paths";

const publicFolder = PUBLIC_DIR;
export default {
  directory: publicFolder,

  storage: multer.diskStorage({
    destination: publicFolder,
    filename(req, file, cb) {
      // Random names plus expiring signed URLs protect uploaded media.
      const ext = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "")
        .slice(0, 8);
      const fileName = `${Date.now()}-${randomBytes(12).toString("hex")}${ext}`;

      return cb(null, fileName);
    }
  })
};
