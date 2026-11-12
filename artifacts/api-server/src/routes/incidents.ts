import { Router, type IRouter } from "express";
import { db, incidentsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { AnalyzeIncidentBody, AnalyzeIncidentResponse, SimulateIncidentBody, UpdateIncidentBody, UpdateIncidentParams, ListIncidentsResponse, GetSummaryResponse } from "@workspace/api-zod";
import { github, sourceFor, treeFor, ServiceError } from "../lib/github";
import { runAnalysis } from "../lib/incident-service";
import { notifyDashboard } from "../lib/incident-events";
import { incidentPrStatus, type PrOutcome } from "../lib/auto-merge";

const router: IRouter = Router();
router.get("/config", async (_req, res) => {
  let connected = false;
  try { await github("/user"); connected = true; } catch {}
  res.json({
    github_token: !!process.env.GITHUB_TOKEN, gemini_api_key: !!process.env.GEMINI_API_KEY,
    slack_webhook_url: !!process.env.SLACK_WEBHOOK_URL,
    github_connected: !!process.env.GITHUB_TOKEN || connected,
    gemini_connected: !!process.env.GEMINI_API_KEY || !!(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL && process.env.AI_INTEGRATIONS_GEMINI_API_KEY),
    sentry_webhook_configured: !!process.env.SENTRY_WEBHOOK_SECRET,
  });
});
router.get("/incidents", async (_req, res) => {
  res.json(ListIncidentsResponse.parse(await db.select().from(incidentsTable).orderBy(desc(incidentsTable.id))));
});
router.get("/summary", async (_req, res) => {
  const rows = await db.select({status: incidentsTable.status, seconds: incidentsTable.elapsed_seconds}).from(incidentsTable);
  const done = (status: string) => ["resolved", "merged", "auto_merged"].includes(status);
  res.json(GetSummaryResponse.parse({ total: rows.length, active: rows.filter(x => !done(x.status)).length,
    resolved: rows.filter(x => done(x.status)).length,
    average_seconds: rows.length ? rows.reduce((n,x) => n+x.seconds,0)/rows.length : 0 }));
});
router.post("/simulate", async (req, res) => {
  const body = SimulateIncidentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({error: "Enter a valid owner/repo and branch."}); return; }
  const {repository, branch} = body.data;
  const paths = await treeFor(repository, branch);
  const path = paths.filter(p => /\.(py|[cm]?js|ts)$/.test(p) && !/(node_modules|vendor|dist|test|spec|\.d\.ts)/.test(p))
    .sort((a,b) => Number(b.startsWith("src/")) - Number(a.startsWith("src/")) || a.length-b.length)[0];
  if (!path) throw new ServiceError("No Python or Node.js source file found in this repository.");
  const content = await sourceFor(repository, branch, path);
  const lines = content.split("\n");
  const index = lines.findIndex(line => /return |await |def |function |=>/.test(line));
  const line = Math.max(1,index+1);
  const stack_trace = path.endsWith(".py")
    ? `# SYNTHETIC SENTRY INCIDENT — not a real production event\nTraceback (most recent call last):\n  File "/app/${path}", line ${line}, in request_handler\n    ${lines[line-1]?.trim()}\nTypeError: 'NoneType' object is not subscriptable`
    : `# SYNTHETIC SENTRY INCIDENT — not a real production event\nTypeError: Cannot read properties of undefined (reading 'id')\n    at requestHandler (/app/${path}:${line}:12)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`;
  res.json({ stack_trace, file_path: path });
});
router.post("/incidents", async (req, res) => {
  const body = AnalyzeIncidentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({error: "Provide a valid repository, branch and stack trace (10–50,000 characters)."}); return; }
  res.status(201).json(await runAnalysis(body.data));
});
router.patch("/incidents/:id", async (req, res) => {
  const params = UpdateIncidentParams.safeParse(req.params);
  const body = UpdateIncidentBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({error:"Invalid incident or status."}); return; }
  const [existing] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, params.data.id));
  const status = body.data.status === "active" && existing?.pr_url
    ? existing.pr_outcome ? incidentPrStatus(existing.pr_outcome as PrOutcome) : "draft_pr_opened"
    : body.data.status;
  const [row] = await db.update(incidentsTable).set({ status }).where(eq(incidentsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({error:"Incident not found."}); return; }
  res.json(AnalyzeIncidentResponse.parse(row));
  notifyDashboard();
});
export default router;
