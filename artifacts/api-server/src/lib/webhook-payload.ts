import { createHmac, timingSafeEqual } from "node:crypto";
import { AnalyzeIncidentBody } from "@workspace/api-zod";
import { ServiceError } from "./github";

export function verifySentrySignature(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), createHmac("sha256", secret).update(raw).digest());
}
export function normalizeSentry(payload: any) {
  const event = payload?.data?.event || payload?.event || payload?.data?.issue?.event || payload;
  const tags = Array.isArray(event?.tags) ? Object.fromEntries(event.tags) : event?.tags || {};
  const exceptions = event?.exception?.values || [];
  const traces = exceptions.map((exception: any) => {
    const frames = exception.stacktrace?.frames || [];
    const python = event.platform === "python" || frames.some((f: any) => String(f.filename || f.abs_path || "").endsWith(".py"));
    const text = frames.filter((f: any) => f.filename || f.abs_path).map((f: any) => {
      const path = f.abs_path || f.filename;
      return python ? `  File "${path}", line ${f.lineno || 1}, in ${f.function || "unknown"}`
        : `    at ${f.function || "unknown"} (${path}:${f.lineno || 1}:${f.colno || 1})`;
    }).join("\n");
    return python ? `Traceback (most recent call last):\n${text}\n${exception.type || "Error"}: ${exception.value || ""}`
      : `${exception.type || "Error"}: ${exception.value || ""}\n${text}`;
  }).join("\n");
  const parsed = AnalyzeIncidentBody.safeParse({
    repository: payload?.repository || tags["github.repository"] || process.env.SENTRY_REPOSITORY,
    branch: payload?.branch || tags["github.branch"] || process.env.SENTRY_BRANCH || "main",
    stack_trace: payload?.stack_trace || traces,
    simulated: payload?.simulated === true,
  });
  if (!parsed.success) throw new ServiceError("Webhook needs repository (owner/repo) and stack_trace, or a Sentry exception event. Set SENTRY_REPOSITORY or a github.repository event tag for native Sentry events.", 400);
  return parsed.data;
}
