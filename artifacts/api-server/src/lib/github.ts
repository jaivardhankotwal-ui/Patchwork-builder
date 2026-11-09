import { ReplitConnectors } from "@replit/connectors-sdk";
export const connectors = new ReplitConnectors();
export class ServiceError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export async function github(path: string, options: {method?: string; body?: unknown} = {}): Promise<any> {
  const response = await (process.env.GITHUB_TOKEN
    ? fetch(`https://api.github.com${path}`, {
        method: options.method || "GET",
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12000),
      })
    : connectors.proxy("github-source-control", path, { ...options, headers: { Accept: "application/vnd.github+json" } }));
  if (!response.ok) throw new ServiceError(
    response.status === 404 ? "Repository, branch or source file not found. Check the path and GitHub access."
      : response.status === 401 || response.status === 403 ? "GitHub access denied or rate limited. Check your connection and repository permissions."
      : response.status === 422 ? "GitHub rejected the branch, commit or draft PR. Check branch rules and repository write permissions."
      : `GitHub request failed (${response.status}). Try again.`, response.status === 404 ? 404 : response.status === 409 ? 409 : 502);
  return response.json();
}
export const repoUrl = (repository: string) => `/repos/${repository.split("/").map(encodeURIComponent).join("/")}`;
export async function treeFor(repository: string, branch: string) {
  const tree = await github(`${repoUrl(repository)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.truncated) throw new ServiceError("Repository tree is too large. Use a smaller repository for this version.");
  return (tree.tree as { path: string; type: string }[]).filter(x => x.type === "blob").map(x => x.path);
}
export async function sourceFor(repository: string, ref: string, path: string) {
  const file = await github(`${repoUrl(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`);
  if (file.type !== "file" || file.encoding !== "base64" || file.size > 60000) {
    throw new ServiceError("Only text source files up to 60 KB are supported. Choose a smaller source file.");
  }
  return Buffer.from(file.content, "base64").toString("utf8");
}
