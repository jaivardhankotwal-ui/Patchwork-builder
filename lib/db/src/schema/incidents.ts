import { pgTable, serial, text, jsonb, doublePrecision, boolean } from "drizzle-orm/pg-core";
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
});
