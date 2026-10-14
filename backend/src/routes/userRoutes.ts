import { Router } from "express";

import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import isManager from "../middleware/isManager";
import * as UserController from "../controllers/UserController";

const userRoutes = Router();

userRoutes.get("/users", isAuth, UserController.index);

userRoutes.post("/users", isAuth, isManager, UserController.store);

userRoutes.put("/users/:userId", isAuth, isManager, UserController.update);

userRoutes.get("/users/:userId", isAuth, UserController.show);

userRoutes.delete("/users/:userId", isAuth, isAdmin, UserController.remove);

export default userRoutes;
