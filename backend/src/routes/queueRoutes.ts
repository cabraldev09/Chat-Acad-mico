import { Router } from "express";
import isAuth from "../middleware/isAuth";
import { cached } from "../middleware/refCache";
import isAdmin from "../middleware/isAdmin";
import isManager from "../middleware/isManager";

import * as QueueController from "../controllers/QueueController";

const queueRoutes = Router();

queueRoutes.get("/queue", isAuth, cached(), QueueController.index);

queueRoutes.post("/queue", isAuth, isManager, QueueController.store);

queueRoutes.get("/queue/:queueId", isAuth, QueueController.show);

queueRoutes.put("/queue/:queueId", isAuth, isManager, QueueController.update);

queueRoutes.delete("/queue/:queueId", isAuth, isManager, QueueController.remove);

export default queueRoutes;
