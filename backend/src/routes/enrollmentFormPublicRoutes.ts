import express from "express";
import multer from "multer";

import * as EnrollmentForm from "../controllers/EnrollmentFormController";
import rateLimit from "../middleware/rateLimit";

// The enrollment form opened by the lead's personal link (the page lives in the site, /ficha/<code>): read, keep each change, send the
// picture of the ID and send it all. The long random code is the key; the pictures are never read back by this side.
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const uploads = rateLimit({ windowMs: 10 * 60 * 1000, max: 40 });

router.get("/:token", EnrollmentForm.publicShow);
router.put("/:token", express.json({ limit: "32kb" }), EnrollmentForm.publicSave);
router.post("/:token/files/:kind", uploads, upload.single("file"), EnrollmentForm.publicFile);
router.delete("/:token/files/:kind", EnrollmentForm.publicRemoveFile);
router.post("/:token/submit", EnrollmentForm.publicSubmit);

export default router;
