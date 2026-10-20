import { Router } from "express";
import * as SessionController from "../controllers/SessionController";
import * as UserController from "../controllers/UserController";
import * as PasswordReset from "../controllers/PasswordResetController";
import isAuth from "../middleware/isAuth";

const authRoutes = Router();


authRoutes.post("/login", SessionController.store);

authRoutes.post("/forgot", PasswordReset.forgot);
authRoutes.get("/reset/:token", PasswordReset.check);
authRoutes.post("/reset", PasswordReset.reset);

authRoutes.post("/refresh_token", SessionController.update);

authRoutes.delete("/logout", isAuth, SessionController.remove);

export default authRoutes;
