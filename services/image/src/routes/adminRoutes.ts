import { Router, type Router as RouterType } from "express";
import { Request, Response } from "express";
import { attachAuth, requireAuth, requireGroup } from "../middleware/auth";

const router: RouterType = Router();

router.use(attachAuth, requireAuth, requireGroup("administrators"));

router.get("/ping", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    message: "Admin endpoint accessible",
    timestamp: new Date().toISOString(),
  });
});

export default router;
