import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";

import * as QueueController from "../controllers/QueueController";

const queueRoutes = Router();

queueRoutes.get("/queue", isAuth, QueueController.index);

queueRoutes.post("/queue", isAuth, isAdmin, QueueController.store);

queueRoutes.get("/queue/:queueId", isAuth, QueueController.show);

queueRoutes.put("/queue/:queueId", isAuth, isAdmin, QueueController.update);

queueRoutes.delete("/queue/:queueId", isAuth, isAdmin, QueueController.remove);

export default queueRoutes;
