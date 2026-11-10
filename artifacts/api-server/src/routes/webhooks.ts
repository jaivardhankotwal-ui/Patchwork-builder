import { Router, type IRouter } from "express";
import { randomUUID, createHash } from "node:crypto";
import { db, pool, webhookJobsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { SimulateSentryWebhookBody, ListWebhookJobsResponse, ReceiveSentryWebhookResponse } from "@workspace/api-zod";
import { normalizeSentry, verifySentrySignature } from "../lib/webhook-payload";
import { ServiceError } from "../lib/github";
import { runAnalysis } from "../lib/incident-service";
import { incidentEvents, notifyDashboard } from "../lib/incident-events";
import { logger } from "../lib/logger";
import type { IncidentInput } from "../lib/incident-types";

const router: IRouter = Router();
function publicJob(job: typeof webhookJobsTable.$inferSelect) {
  const input = job.payload as IncidentInput;
  return { ...job, branch: input.branch, stack_trace: input.stack_trace, simulated: input.simulated === true };
}
async function enqueue(input: IncidentInput, delivery: string) {
  const [inserted] = await db.insert(webhookJobsTable).values({
    repository: input.repository, payload: input, delivery_id: delivery, created_at: new Date().toISOString(),
  }).onConflictDoNothing().returning();
  const job = inserted || (await db.select().from(webhookJobsTable).where(eq(webhookJobsTable.delivery_id, delivery)))[0];
  notifyDashboard();
  return ReceiveSentryWebhookResponse.parse(publicJob(job));
}
router.post("/webhooks/sentry", async (req, res) => {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) { res.status(503).json({ error: "SENTRY_WEBHOOK_SECRET is not configured. Add the signing secret before enabling external webhooks." }); return; }
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!raw || !verifySentrySignature(raw, req.get("sentry-hook-signature"), secret)) {
    res.status(401).json({ error: "Invalid or missing Sentry webhook signature." }); return;
  }
  // Sentry pings are acknowledged without spending AI credits.
  if (req.body?.action === "installation.created" || req.get("sentry-hook-resource") === "installation") {
    res.status(200).json({ status: "acknowledged" }); return;
  }
  const input = normalizeSentry(req.body);
  const delivery = createHash("sha256").update(raw).digest("hex");
  res.status(202).json(await enqueue(input, `sentry:${delivery}`));
});
router.post("/webhooks/sentry/simulate", async (req, res) => {
  const parsed = SimulateSentryWebhookBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Provide a repository, branch and simulated stack trace." }); return; }
  res.status(202).json(await enqueue({ ...parsed.data, simulated: true }, `simulation:${randomUUID()}`));
});
router.get("/webhooks/jobs", async (_req, res) => {
  const jobs = await db.select().from(webhookJobsTable).orderBy(desc(webhookJobsTable.id)).limit(10);
  res.json(ListWebhookJobsResponse.parse(jobs.map(publicJob)));
});
router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const change = () => res.write(`event: incidents\ndata: {}\n\n`);
  res.write("retry: 3000\n\n");
  change();
  incidentEvents.on("change", change);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);
  req.on("close", () => { incidentEvents.off("change", change); clearInterval(heartbeat); });
});

let running = false;
// A session advisory lock guarantees one durable queue worker across app instances.
export function startWebhookWorker() {
  const tick = async () => {
    if (running) return;
    running = true;
    const connection = await pool.connect().catch(() => null);
    if (!connection) { running = false; return; }
    try {
      const lock = await connection.query("SELECT pg_try_advisory_lock(72111, 0) AS locked");
      if (!lock.rows[0].locked) return;
      const [job] = await db.select().from(webhookJobsTable).where(eq(webhookJobsTable.status, "processing")).orderBy(webhookJobsTable.id).limit(1);
      const next = job || (await db.select().from(webhookJobsTable).where(eq(webhookJobsTable.status, "queued")).orderBy(webhookJobsTable.id).limit(1))[0];
      if (!next) return;
      await db.update(webhookJobsTable).set({ status: "processing" }).where(eq(webhookJobsTable.id, next.id));
      notifyDashboard();
      try {
        await runAnalysis(next.payload as IncidentInput, next.delivery_id);
      } catch (err) {
        const busy = err instanceof ServiceError && err.status === 429;
        // Don't overwrite completed jobs if an optional post-save notification failed.
        const [current] = await db.select().from(webhookJobsTable).where(eq(webhookJobsTable.id, next.id));
        if (current.status !== "completed") await db.update(webhookJobsTable).set({
          status: busy ? "queued" : "failed",
          error: busy ? null : err instanceof ServiceError ? err.message : "Diagnosis failed. Check provider connections and resubmit the incident.",
        }).where(eq(webhookJobsTable.id, next.id));
      }
      notifyDashboard();
    } catch { logger.error("Webhook worker failed; persisted jobs will be retried."); }
    finally {
      await connection.query("SELECT pg_advisory_unlock(72111, 0)");
      connection.release(); running = false;
    }
  };
  const interval = setInterval(() => { void tick(); }, 2000);
  interval.unref();
  void tick();
}
export default router;
