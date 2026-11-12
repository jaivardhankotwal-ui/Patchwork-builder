import { Router, type IRouter } from "express";
import { db, pool, incidentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AnalyzeIncidentResponse, CreateIncidentPrBody, CreateIncidentPrParams, SendIncidentSlackParams, GetMergeAccessQueryParams, GetMergeAccessResponse } from "@workspace/api-zod";
import { preparePr, writeDraftPr } from "../lib/draft-pr";
import { deliverSlack } from "../lib/slack";
import { github, repoUrl, ServiceError } from "../lib/github";
import { notifyDashboard } from "../lib/incident-events";
import { incidentPrStatus, requireMergeConsent, resolvePrOutcome } from "../lib/auto-merge";
import { authorizeRepositoryMerge, mergeIdentity } from "../lib/merge-authorization";

const router: IRouter = Router();
router.get("/merge-access", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const query = GetMergeAccessQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Provide a valid owner/repository." }); return; }
  let userId: string;
  try { userId = mergeIdentity(req); }
  catch { res.json(GetMergeAccessResponse.parse({ signed_in: false, allowed: false, user_id: null, reason: "Sign in to request Auto-Merge." })); return; }
  try {
    await authorizeRepositoryMerge(userId, query.data.repository);
    res.json(GetMergeAccessResponse.parse({ signed_in: true, allowed: true, user_id: userId, reason: null }));
  } catch (error) {
    res.json(GetMergeAccessResponse.parse({ signed_in: true, allowed: false, user_id: userId,
      reason: error instanceof ServiceError ? error.message : "Authorization could not be verified." }));
  }
});
router.post("/incidents/:id/create-pr", async (req, res) => {
  const params = CreateIncidentPrParams.safeParse(req.params);
  const body = CreateIncidentPrBody.safeParse(req.body ?? {});
  if (!params.success || params.data.id < 1 || !body.success) { res.status(400).json({ error: "Invalid incident ID or autonomy mode." }); return; }
  const { mode, confirm_auto_merge } = body.data;
  // Identity must be verified before touching the database or connected GitHub
  // account. Repository grants are verified below, from server-owned metadata.
  const mergeUser = mode === "auto_merge" ? mergeIdentity(req) : null;
  const connection = await pool.connect();
  let acquired = false;
  try {
    const locked = await connection.query("SELECT pg_try_advisory_lock(72112, $1) AS locked", [params.data.id]);
    if (!locked.rows[0].locked) throw new ServiceError("Draft PR creation is already running for this incident.", 409);
    acquired = true;
    const [row] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, params.data.id));
    if (!row) throw new ServiceError("Incident not found.", 404);
    const incident = AnalyzeIncidentResponse.parse(row);
    if (mergeUser) await authorizeRepositoryMerge(mergeUser, incident.repository);
    requireMergeConsent(mode, confirm_auto_merge, incident);
    let branch = row.pr_branch;
    let url = row.pr_url;
    // Recover remote success before preflight: main may already contain the
    // patch after a merge whose response/database save was interrupted.
    if (!url && branch) {
      const existing = await github(`${repoUrl(incident.repository)}/pulls?state=all&head=${encodeURIComponent(incident.repository.split("/")[0] + ":" + branch)}&base=${encodeURIComponent(incident.branch)}`);
      if (existing.length > 1) throw new ServiceError("Multiple PRs found for the recovery branch. Check GitHub before retrying.", 409);
      url = existing[0]?.html_url ?? null;
    }
    if (!url) {
      const { baseSha, original } = await preparePr(incident);
      branch ||= `patchwork/fix-${baseSha.slice(0, 8)}-${Date.now()}`;
      // Persist branch identity before remote writes so retries recover the same operation.
      if (!row.pr_branch) await db.update(incidentsTable).set({ pr_branch: branch }).where(eq(incidentsTable.id, row.id));
      url = await writeDraftPr(incident, branch, baseSha, original, undefined, mode);
    }
    if (!branch) throw new ServiceError("This legacy PR has no saved patch branch. Check it on GitHub; no merge was attempted.", 409);
    // Save remote PR identity before attempting any readiness/merge writes.
    await db.update(incidentsTable).set({ pr_url: url }).where(eq(incidentsTable.id, row.id));
    const outcome = await resolvePrOutcome(incident, url, branch, mode, confirm_auto_merge);
    const [updated] = await db.update(incidentsTable).set({ pr_url: url, pr_outcome: outcome, status: incidentPrStatus(outcome) })
      .where(eq(incidentsTable.id, row.id)).returning();
    notifyDashboard();
    // Slack failures never roll back a confirmed GitHub outcome.
    res.json(AnalyzeIncidentResponse.parse(await deliverSlack(AnalyzeIncidentResponse.parse(updated))));
  } finally {
    try { if (acquired) await connection.query("SELECT pg_advisory_unlock(72112, $1)", [params.data.id]); }
    finally { connection.release(); }
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
