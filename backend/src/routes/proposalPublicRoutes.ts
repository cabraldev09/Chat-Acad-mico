import express from "express";
import * as Proposal from "../controllers/ProposalController";

// The candidate opens the proposal from the link sent in the conversation
const router = express.Router();
router.get("/:token", Proposal.publicView);
router.get("/:token/pdf", Proposal.publicPdf);
export default router;
