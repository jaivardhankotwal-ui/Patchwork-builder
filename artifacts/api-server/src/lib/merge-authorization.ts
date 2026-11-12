import type { Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { ServiceError } from "./github";

// Public metadata is readable by the browser, but only the trusted Clerk
// backend (or the operator's CLI) may write it. Never trust unsafeMetadata,
// request headers, cookies containing role names, or client-supplied grants.
export const MERGE_GRANTS_KEY = "patchwork_merge_admin_repositories";
type Dependencies = {
  identity: (req: Request) => string | null;
  metadata: (userId: string) => Promise<Record<string, unknown>>;
};
const live: Dependencies = {
  identity: req => getAuth(req).userId,
  metadata: async userId => (await clerkClient.users.getUser(userId)).publicMetadata,
};
export function mergeIdentity(req: Request, deps = live) {
  let userId: string | null;
  try { userId = deps.identity(req); } catch { userId = null; }
  if (!userId) throw new ServiceError("Sign in before requesting Auto-Merge.", 401);
  return userId;
}
export async function authorizeRepositoryMerge(userId: string, repository: string, deps = live) {
  let metadata: Record<string, unknown>;
  try { metadata = await deps.metadata(userId); }
  catch { throw new ServiceError("Merge authorization could not be verified. No GitHub write was attempted.", 503); }
  const grants = metadata[MERGE_GRANTS_KEY];
  if (!Array.isArray(grants) || !grants.some(repo => typeof repo === "string" && repo.toLowerCase() === repository.toLowerCase())) {
    throw new ServiceError("Repository-scoped merge administrator permission is required. Ask the workspace owner to grant access.", 403);
  }
}
