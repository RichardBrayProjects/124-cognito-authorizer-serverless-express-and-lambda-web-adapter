import { Router, type Router as RouterType } from "express";
import { getProfile } from "../controllers/profileController";
import { attachAuth, requireAuth } from "../middleware/auth";

const router: RouterType = Router();

router.use(attachAuth, requireAuth);

router.get("/", getProfile);

export default router;
