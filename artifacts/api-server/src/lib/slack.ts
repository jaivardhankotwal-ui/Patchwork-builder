import { db, incidentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Incident } from "./incident-types";
import { notifyDashboard } from "./incident-events";

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function slackMessage(incident: Incident) {
  const d = incident.diagnosis;
  const header = `🚨 Patchwork AI: Production Crash Diagnosed in ${incident.elapsed_seconds}s`;
  const author = d.suspect_author_login || d.suspect_author?.split(" · ")[0];
  const attribution = d.suspect_commit_sha && author
    ? `Introduced by @${escape(author)} in commit \`${escape(d.suspect_commit_sha)}\` (suspected)`
    : "Introducing commit or author not identified.";
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: header.slice(0,150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*Error:* ${escape(incident.error_type)}\n*File:* ${escape(d.file_path)}\n${attribution}`.slice(0,2900) } },
    { type: "section", text: { type: "mrkdwn", text: `*Root cause*\n${escape(d.root_cause_summary).slice(0,2800)}` } },
    { type: "context", elements: [{ type: "plain_text", text:
      `${incident.simulated ? "SIMULATED INCIDENT. " : ""}Draft only — senior developer verification and tests required. Never automatically merged.` }] },
  ];
  if (incident.pr_url) blocks.push({ type: "actions", elements: [{
    type: "button", text: { type: "plain_text", text: "Review Draft PR on GitHub" }, url: incident.pr_url,
  }] });
  else blocks.push({ type: "context", elements: [{ type: "plain_text", text: "No draft PR has been created yet. Open one from the Patchwork diagnosis card." }] });
  return { text: header, blocks, unfurl_links: false, unfurl_media: false };
}
export async function deliverSlack(incident: Incident) {
  let status: "not_configured" | "sent" | "failed" = "not_configured";
  let error: string | null = "SLACK_WEBHOOK_URL is not configured.";
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const url = new URL(process.env.SLACK_WEBHOOK_URL);
      if (url.protocol !== "https:" || !["hooks.slack.com", "hooks.slack-gov.com"].includes(url.hostname) || !url.pathname.startsWith("/services/")) {
        throw new Error("invalid");
      }
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(slackMessage(incident)),
        signal: AbortSignal.timeout(8000), redirect: "error",
      });
      if (!response.ok || (await response.text()).trim() !== "ok") throw new Error("delivery");
      status = "sent"; error = null;
    } catch {
      // Never persist provider response bodies or the secret URL.
      status = "failed"; error = "Slack delivery failed. Check the incoming webhook and channel permissions, then retry.";
    }
  }
  const [updated] = await db.update(incidentsTable).set({ slack_status: status, slack_error: error })
    .where(eq(incidentsTable.id, incident.id)).returning();
  notifyDashboard();
  return updated;
}
