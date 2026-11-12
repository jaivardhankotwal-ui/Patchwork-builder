import { clerkClient } from "@clerk/express";
import { MERGE_GRANTS_KEY } from "../lib/merge-authorization";

// Operator-only CLI. This is not an HTTP endpoint and never self-promotes the
// first registrant. Use an independently verified user's displayed Clerk ID.
const [userId, repository, revoke] = process.argv.slice(2).filter(x => x !== "--");
if (!/^user_[A-Za-z0-9]+$/.test(userId || "") || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") ||
    (revoke && revoke !== "--revoke")) {
  console.error("Usage: pnpm --filter @workspace/api-server run merge-admin -- user_ID owner/repo [--revoke]");
  process.exit(1);
}
const users = clerkClient.users;
const user = await users.getUser(userId);
if (!user.emailAddresses.some(e => e.verification?.status === "verified")) {
  throw new Error("Only grant access after this user has verified their email and you have independently confirmed their identity.");
}
const existing = user.publicMetadata[MERGE_GRANTS_KEY];
const grants = Array.isArray(existing) ? existing.filter((x): x is string => typeof x === "string") : [];
const next = grants.filter(x => x.toLowerCase() !== repository.toLowerCase());
if (!revoke) next.push(repository.toLowerCase());
await users.updateUserMetadata(userId, { publicMetadata: { [MERGE_GRANTS_KEY]: next } });
console.log(`Repository-scoped merge permission ${revoke ? "revoked" : "granted"}. No PR was created or merged.`);
