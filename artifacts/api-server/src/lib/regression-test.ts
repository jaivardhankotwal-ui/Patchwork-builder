import { z } from "zod";
import { ServiceError } from "./github";

export const regressionTestSchema = z.object({
  file_path: z.string().min(1).max(240),
  content: z.string().min(10).max(60000),
  run_command: z.string().min(1).max(500),
  description: z.string().min(1).max(2000),
});

// Generated tests are new files only, never replacements for existing tests or configuration.
export function validateRegressionTest(test: z.infer<typeof regressionTestSchema>, sourcePath: string) {
  const parsed = regressionTestSchema.safeParse(test);
  if (!parsed.success || test.file_path === sourcePath ||
      !/^[A-Za-z0-9_./-]+\.(?:py|[cm]?js|jsx|tsx?)$/.test(test.file_path) ||
      test.file_path.startsWith("/") || test.file_path.split("/").some(p => !p || p.startsWith(".") || p === "node_modules" || p === "vendor") ||
      !/(?:^|\/)(?:tests?\/|__tests__\/|test_[^/]+\.py$)|(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(test.file_path)) {
    throw new ServiceError("Generated regression test has an unsafe or invalid test file path. Re-analyze before opening a PR.", 422);
  }
}
