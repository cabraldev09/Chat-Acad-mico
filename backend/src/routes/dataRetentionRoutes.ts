import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSystemAdmin from "../middleware/isSystemAdmin";
import * as DataRetention from "../controllers/DataRetentionController";

// Retention of the content of the conversations and of the voice notes: the administrator alone (coordination does not delete content)
const r = Router();
r.get("/data-retention", isAuth, isSystemAdmin, DataRetention.show);
r.put("/data-retention", isAuth, isSystemAdmin, DataRetention.save);
r.post("/data-retention/simulate", isAuth, isSystemAdmin, DataRetention.simulate);
export default r;
