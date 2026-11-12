import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { mergeIdentity, authorizeRepositoryMerge, MERGE_GRANTS_KEY } from "./merge-authorization";
import { ServiceError } from "./github";
import app from "../app";

test("anonymous, forged headers and expired sessions cannot reach an authorized GitHub operation", async () => {
  let writes = 0;
  const req = { headers: { "x-user-id": "user_forged", "x-role": "admin" }, body: { confirm_auto_merge: true } } as unknown as Request;
  for (const identity of [() => null, () => { throw new Error("expired"); }]) {
    await assert.rejects(async () => {
      const user = mergeIdentity(req, { identity, metadata: async () => ({}) });
      await authorizeRepositoryMerge(user, "example/service");
      writes++;
    }, (error: unknown) => error instanceof ServiceError && error.status === 401);
  }
  assert.equal(writes, 0);
});
test("authenticated non-admins and admins for other repositories cannot merge", async () => {
  let writes = 0;
  for (const metadata of [{}, { role: "admin" }, { [MERGE_GRANTS_KEY]: ["other/repo"] },
    { [MERGE_GRANTS_KEY]: ["*"] }, { unsafeMetadata: { [MERGE_GRANTS_KEY]: ["example/service"] } }]) {
    await assert.rejects(async () => {
      await authorizeRepositoryMerge("user_test", "example/service", { identity: () => "user_test", metadata: async () => metadata });
      writes++;
    }, (error: unknown) => error instanceof ServiceError && error.status === 403);
  }
  assert.equal(writes, 0);
});
test("explicit trusted metadata grant authorizes exactly its repository; provider errors fail closed", async () => {
  await authorizeRepositoryMerge("user_test", "Example/Service", {
    identity: () => "user_test", metadata: async () => ({ [MERGE_GRANTS_KEY]: ["example/service"] }),
  });
  await assert.rejects(() => authorizeRepositoryMerge("user_test", "example/service", {
    identity: () => "user_test", metadata: async () => { throw new Error("provider down"); },
  }), (error: unknown) => error instanceof ServiceError && error.status === 503);
});
test("real API rejects unauthorized auto-merge before database lookup or any GitHub operation", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/incidents/2147483647/create-pr`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-user-id": "user_forged", "x-role": "admin", Origin: "https://attacker.example" },
      body: JSON.stringify({ mode: "auto_merge", confirm_auto_merge: true }),
    });
    assert.equal(response.status, 401);
    assert.match((await response.json() as { error: string }).error, /Sign in/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
