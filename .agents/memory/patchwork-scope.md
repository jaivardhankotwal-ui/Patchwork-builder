---
name: Patchwork scope and guardrails
description: Product intent and boundaries for incident diagnosis
---
Patchwork is an autonomous production-crash diagnosis dashboard, targeting diagnoses and proposed code patches in under 60 seconds using GitHub file history and Gemini.

**Why:** The user's attached specification defines this workflow. Timing is a performance target, not a guarantee about external API latency.

**How to apply:** Keep commit attribution evidence-based and label synthetic incidents. The user subsequently authorized creating a branch, committing a proposed file, and opening a draft PR on explicit user action. Never automatically merge, force-push, deploy, or equate manually resolving an incident with deploying a fix.

The user connected GitHub through Replit; Gemini uses Replit AI Integrations, while the dashboard also reports literal environment-variable presence separately.

**Why:** Managed connections avoid asking for credentials already available through integrations. A connected provider does not mean its traditional environment variable is set.

**How to apply:** Preserve both the environment indicators requested in the specification and truthful managed-connection indicators.

Slack notifications are requested after diagnosis and draft PR creation, with a manual send action. A signed Sentry receiver should trigger analysis and refresh the dashboard.

**Why:** The user expanded the workflow to include human-in-the-loop draft PRs, Slack incident alerts and live webhook ingestion.

**How to apply:** Draft PR links must not be called ready to merge before human review; if no PR exists yet, say so. Missing webhook credentials must be visible, not silently simulated.
