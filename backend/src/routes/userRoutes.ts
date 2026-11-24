import { Router } from "express";

import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import isManager from "../middleware/isManager";
import canEditUser from "../middleware/canEditUser";
import * as UserController from "../controllers/UserController";

const userRoutes = Router();

userRoutes.get("/users", isAuth, UserController.index);

userRoutes.post("/users", isAuth, isManager, UserController.store);

// the management edits the team; anyone edits their own profile (name, phone, password)
userRoutes.put("/users/:userId", isAuth, canEditUser, UserController.update);

userRoutes.get("/users/:userId", isAuth, UserController.show);

userRoutes.delete("/users/:userId", isAuth, isAdmin, UserController.remove);

export default userRoutes;
