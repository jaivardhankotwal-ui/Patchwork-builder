import { pgTable, serial, text, jsonb, doublePrecision, boolean, integer } from "drizzle-orm/pg-core";
export const incidentsTable = pgTable("incidents", {
  id: serial("id").primaryKey(),
  repository: text("repository").notNull(),
  branch: text("branch").notNull(),
  stack_trace: text("stack_trace").notNull(),
  error_type: text("error_type").notNull(),
  status: text("status").notNull().default("active"),
  created_at: text("created_at").notNull(),
  elapsed_seconds: doublePrecision("elapsed_seconds").notNull(),
  simulated: boolean("simulated").notNull().default(false),
  diagnosis: jsonb("diagnosis").notNull(),
  pr_url: text("pr_url"),
  pr_branch: text("pr_branch"),
  slack_status: text("slack_status").notNull().default("not_sent"),
  slack_error: text("slack_error"),
});
export const webhookJobsTable = pgTable("webhook_jobs", {
  id: serial("id").primaryKey(),
  delivery_id: text("delivery_id").notNull().unique(),
  repository: text("repository").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("queued"),
  incident_id: integer("incident_id").references(() => incidentsTable.id),
  error: text("error"),
  created_at: text("created_at").notNull(),
});
