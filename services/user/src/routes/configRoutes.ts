import { Router, type Router as RouterType } from "express";
import { getConfig } from "../controllers/configController";

const router: RouterType = Router();

// Public endpoint - no authentication required
// Wrap in async handler to catch errors
router.get("/", (req, res, next) => {
  getConfig(req, res).catch(next);
});

export default router;
