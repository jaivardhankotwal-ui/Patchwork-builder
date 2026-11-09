import { db, pool, incidentsTable, webhookJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AnalyzeIncidentResponse } from "@workspace/api-zod";
import { diagnose } from "./diagnose";
import { ServiceError } from "./github";
import { deliverSlack } from "./slack";
import { notifyDashboard } from "./incident-events";
import type { IncidentInput } from "./incident-types";

export async function runAnalysis(input: IncidentInput, deliveryId?: string) {
  const connection = await pool.connect();
  try {
    const lock = await connection.query("SELECT pg_try_advisory_lock(72110, 0) AS locked");
    if (!lock.rows[0].locked) throw new ServiceError("An analysis is already running. Please wait for it to finish.", 429);
    const start = Date.now();
    const result = await diagnose(input);
    // For webhook jobs, save incident and completion together so a crash cannot create duplicates.
    const row = await db.transaction(async tx => {
      const [saved] = await tx.insert(incidentsTable).values({
        ...input, ...result, status: "active", created_at: new Date().toISOString(),
        elapsed_seconds: Math.round((Date.now() - start) / 100) / 10,
      }).returning();
      if (deliveryId) {
        await tx.update(webhookJobsTable).set({ status: "completed", incident_id: saved.id, error: null })
          .where(eq(webhookJobsTable.delivery_id, deliveryId));
      }
      return saved;
    });
    notifyDashboard();
    const incident = AnalyzeIncidentResponse.parse(row);
    try { return AnalyzeIncidentResponse.parse(await deliverSlack(incident)); }
    catch { return incident; } // Saved diagnosis survives a notification/database notification-state failure.
  } finally {
    await connection.query("SELECT pg_advisory_unlock(72110, 0)");
    connection.release();
  }
}
