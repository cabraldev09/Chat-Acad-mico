import { Router } from "express";
import multer from "multer";

import * as Analysis from "../controllers/AnalysisController";
import * as Portal from "../controllers/StudentPortalController";
import * as Grades from "../controllers/GradeController";
import isAdmin from "../middleware/isAdmin";
import isAuth from "../middleware/isAuth";
import rateLimit from "../middleware/rateLimit";

// PDFs are read in memory and never written to disk
const pdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

const gradeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 150 } });

const r = Router();

// ---- staff: rules, curricular analysis (entry forecast), academic analysis (graduation forecast), students
r.get("/analysis/rules", isAuth, Analysis.rulesShow);
r.put("/analysis/rules", isAuth, isAdmin, Analysis.rulesSave);

r.get("/analysis/curricular", isAuth, Analysis.curricularIndex);
r.post("/analysis/curricular", isAuth, rateLimit({ windowMs: 60000, max: 20, key: req => `an:${(req as any).user?.id}` }), pdf.single("file"), Analysis.curricularStore);
r.get("/analysis/curricular/:id", isAuth, Analysis.curricularShow);
r.put("/analysis/curricular/:id", isAuth, Analysis.curricularUpdate);
r.put("/analysis/curricular/:id/subject/:subjectId", isAuth, Analysis.curricularSubject);
r.delete("/analysis/curricular/:id", isAuth, Analysis.curricularRemove);

r.get("/analysis/academic", isAuth, Analysis.academicIndex);
r.post("/analysis/academic", isAuth, rateLimit({ windowMs: 60000, max: 20, key: req => `an:${(req as any).user?.id}` }), pdf.single("file"), Analysis.academicStore);
r.get("/analysis/academic/:id", isAuth, Analysis.academicShow);
r.put("/analysis/academic/:id", isAuth, Analysis.academicUpdate);
r.delete("/analysis/academic/:id", isAuth, Analysis.academicRemove);

r.get("/students", isAuth, Analysis.studentIndex);
r.post("/students", isAuth, Analysis.studentStore);
r.get("/students/portal-url", isAuth, Analysis.portalUrl);
r.get("/students/:id", isAuth, Analysis.studentShow);
r.put("/students/:id", isAuth, Analysis.studentUpdate);
r.post("/students/:id/invite", isAuth, Analysis.studentInvite);
r.post("/students/:id/upload", isAuth, rateLimit({ windowMs: 60000, max: 20, key: req => `an:${(req as any).user?.id}` }), pdf.single("file"), Analysis.studentUpload);

// ---- commercial grades (matrices): everybody consults and sends, the management publishes
r.get("/grades", isAuth, Grades.index);
r.post("/grades", isAuth, rateLimit({ windowMs: 60000, max: 10, key: req => `gr:${(req as any).user?.id}` }), gradeUpload.array("files", 150), Grades.store);
r.post("/grades/import-defaults", isAuth, Grades.importDefaults);
r.get("/grades/:id", isAuth, Grades.show);
r.get("/grades/:id/file", isAuth, Grades.file);
r.post("/grades/:id/send", isAuth, Grades.send);
r.delete("/grades/:id", isAuth, Grades.remove);

// ---- the student's own portal (its own login and token)
r.post("/portal/login", rateLimit({ windowMs: 15 * 60000, max: 20 }), Portal.login);
r.get("/portal/token/:token", rateLimit({ windowMs: 15 * 60000, max: 60 }), Portal.checkToken);
r.post("/portal/activate", rateLimit({ windowMs: 15 * 60000, max: 20 }), Portal.activate);
r.post("/portal/forgot", rateLimit({ windowMs: 15 * 60000, max: 6 }), Portal.forgot);
r.get("/portal/me", Portal.isStudentAuth, Portal.me);
r.get("/portal/versions/:id", Portal.isStudentAuth, Portal.version);
r.post("/portal/upload", Portal.isStudentAuth, rateLimit({ windowMs: 3600000, max: 12, key: req => `pu:${(req as any).student?.id || req.ip}` }), pdf.single("file"), Portal.upload);
r.put("/portal/password", Portal.isStudentAuth, rateLimit({ windowMs: 15 * 60000, max: 10, key: req => `pw:${(req as any).student?.id || req.ip}` }), Portal.changePassword);

export default r;
