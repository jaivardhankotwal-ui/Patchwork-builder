export type DiffLine = { kind: "same" | "add" | "del"; text: string; a?: number; b?: number };

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.replace(/\n$/, "").split("\n");
  const B = b.replace(/\n$/, "").split("\n");
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ kind: "same", text: A[i], a: i + 1, b: j + 1 }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: "del", text: A[i], a: i + 1 }); i++; }
    else { out.push({ kind: "add", text: B[j], b: j + 1 }); j++; }
  }
  while (i < n) { out.push({ kind: "del", text: A[i], a: i + 1 }); i++; }
  while (j < m) { out.push({ kind: "add", text: B[j], b: j + 1 }); j++; }
  return out;
}

export type SideRow = { left?: DiffLine; right?: DiffLine };
export function toSideBySide(lines: DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let dels: DiffLine[] = [], adds: DiffLine[] = [];
  const flush = () => {
    const k = Math.max(dels.length, adds.length);
    for (let x = 0; x < k; x++) rows.push({ left: dels[x], right: adds[x] });
    dels = []; adds = [];
  };
  for (const l of lines) {
    if (l.kind === "del") dels.push(l);
    else if (l.kind === "add") adds.push(l);
    else { flush(); rows.push({ left: l, right: l }); }
  }
  flush();
  return rows;
}

export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  const anyE = e as { data?: { error?: string; message?: string }; message?: string };
  return anyE.data?.error || anyE.data?.message || anyE.message || String(e);
}

export function fmtSec(s: number) {
  if (!isFinite(s)) return "—";
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
