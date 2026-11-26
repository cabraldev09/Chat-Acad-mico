import express from "express";
import multer from "multer";
import uploadConfig from "../config/upload";

import * as ApiController from "../controllers/ApiController";
import isAuthApi from "../middleware/isAuthApi";
import { canSendMessages } from "../middleware/apiScope";
import { perToken } from "./apiV1Routes";
import { batchLimit } from "../helpers/UploadLimit";
import { PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES, PUBLIC_UPLOAD_MAX_BATCH_BYTES, PUBLIC_UPLOAD_MAX_FILE_BYTES } from "../helpers/PublicUploadPolicy";
import { uploadCapacity } from "../middleware/uploadCapacity";

const upload = multer({ ...uploadConfig, limits: { fileSize: PUBLIC_UPLOAD_MAX_FILE_BYTES, files: 5 } });

const ApiRoutes = express.Router();

// legacy route: the same gate of POST /api/v1/messages/send, BEFORE the upload (a refused call stores no file): limit per token and
// the scope messages:send; the polo of the token is checked in the controller (helpers/ApiPoloSend)
ApiRoutes.post("/send", isAuthApi, perToken, canSendMessages, uploadCapacity(PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES), upload.array("medias"), batchLimit(PUBLIC_UPLOAD_MAX_BATCH_BYTES), ApiController.index);

export default ApiRoutes;
