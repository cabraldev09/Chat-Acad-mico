import express from "express";
import multer from "multer";
import uploadConfig from "../config/upload";

import * as ApiController from "../controllers/ApiController";
import isAuthApi from "../middleware/isAuthApi";
import { batchLimit } from "../helpers/UploadLimit";
import { PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES, PUBLIC_UPLOAD_MAX_BATCH_BYTES, PUBLIC_UPLOAD_MAX_FILE_BYTES } from "../helpers/PublicUploadPolicy";
import { uploadCapacity } from "../middleware/uploadCapacity";

const upload = multer({ ...uploadConfig, limits: { fileSize: PUBLIC_UPLOAD_MAX_FILE_BYTES, files: 5 } });

const ApiRoutes = express.Router();

ApiRoutes.post("/send", isAuthApi, uploadCapacity(PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES), upload.array("medias"), batchLimit(PUBLIC_UPLOAD_MAX_BATCH_BYTES), ApiController.index);

export default ApiRoutes;
