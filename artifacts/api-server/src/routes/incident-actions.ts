import { Router, type IRouter } from "express";
import { db, pool, incidentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AnalyzeIncidentResponse, CreateIncidentPrParams, SendIncidentSlackParams } from "@workspace/api-zod";
import { preparePr, writeDraftPr } from "../lib/draft-pr";
import { deliverSlack } from "../lib/slack";
import { ServiceError } from "../lib/github";
import { notifyDashboard } from "../lib/incident-events";

const router: IRouter = Router();
router.post("/incidents/:id/create-pr", async (req, res) => {
  const params = CreateIncidentPrParams.safeParse(req.params);
  if (!params.success || params.data.id < 1) { res.status(400).json({ error: "Invalid incident ID." }); return; }
  const connection = await pool.connect();
  try {
    const locked = await connection.query("SELECT pg_try_advisory_lock(72112, $1) AS locked", [params.data.id]);
    if (!locked.rows[0].locked) throw new ServiceError("Draft PR creation is already running for this incident.", 409);
    const [row] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, params.data.id));
    if (!row) throw new ServiceError("Incident not found.", 404);
    if (row.pr_url) { res.json(AnalyzeIncidentResponse.parse(row)); return; }
    const incident = AnalyzeIncidentResponse.parse(row);
    const { baseSha, original } = await preparePr(incident);
    const branch = row.pr_branch || `patchwork/fix-${(incident.diagnosis.suspect_commit_sha || baseSha).slice(0, 8)}-${Date.now()}`;
    // Persist branch identity before remote writes so retries recover the same operation.
    if (!row.pr_branch) await db.update(incidentsTable).set({ pr_branch: branch }).where(eq(incidentsTable.id, row.id));
    const url = await writeDraftPr(incident, branch, baseSha, original);
    const [updated] = await db.update(incidentsTable).set({ pr_url: url, status: "draft_pr_opened" })
      .where(eq(incidentsTable.id, row.id)).returning();
    notifyDashboard();
    // Slack failures never roll back a successfully opened draft PR.
    res.json(AnalyzeIncidentResponse.parse(await deliverSlack(AnalyzeIncidentResponse.parse(updated))));
  } finally {
    await connection.query("SELECT pg_advisory_unlock(72112, $1)", [params.data.id]);
    connection.release();
  }
});
router.post("/incidents/:id/slack", async (req, res) => {
  const params = SendIncidentSlackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid incident ID." }); return; }
  const [row] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, params.data.id));
  if (!row) throw new ServiceError("Incident not found.", 404);
  res.json(AnalyzeIncidentResponse.parse(await deliverSlack(AnalyzeIncidentResponse.parse(row))));
});
export default router;
