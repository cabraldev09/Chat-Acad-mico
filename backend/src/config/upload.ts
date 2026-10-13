import path from "path";
import multer from "multer";
import { randomBytes } from "crypto";

const publicFolder = path.resolve(__dirname, "..", "..", "public");
export default {
  directory: publicFolder,

  storage: multer.diskStorage({
    destination: publicFolder,
    filename(req, file, cb) {
      // unguessable name: /public is served without authentication
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
