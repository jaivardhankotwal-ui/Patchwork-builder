import { Router, type IRouter } from "express";
import healthRouter from "./health";
import incidentsRouter from "./incidents";
import incidentActions from "./incident-actions";
import webhooks from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(incidentsRouter);
router.use(incidentActions);
router.use(webhooks);

export default router;
