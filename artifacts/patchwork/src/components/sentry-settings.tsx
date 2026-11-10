import { useState } from "react";
import { CheckCircle2, Copy, Loader2, Settings2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function SentrySettings({ configured, checking, failed, onCheck }: {
  configured: boolean; checking: boolean; failed: boolean; onCheck: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const endpoint = new URL(`${import.meta.env.BASE_URL}api/webhooks/sentry`, window.location.origin).href;
  return (
    <Dialog onOpenChange={(open) => { if (open) { setCopied(false); setCopyFailed(false); onCheck(); } }}>
      <DialogTrigger asChild>
        <button type="button" data-testid="button-sentry-settings" className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800">
          <Settings2 className="size-3.5" /> Sentry settings
        </button>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-orange-400" />Sentry webhook settings</DialogTitle>
          <DialogDescription>Signed production crashes are queued automatically for background Gemini diagnosis.</DialogDescription>
        </DialogHeader>
        <div role="status" className={`rounded-lg border p-3 text-sm ${failed ? "border-rose-500/30 text-rose-300" : configured ? "border-emerald-500/30 text-emerald-300" : "border-orange-500/30 text-orange-300"}`}>
          {failed ? "Could not check the receiver. Retry below." : checking ? "Checking receiver configuration…" : configured ? "Signing secret configured · signed deliveries enabled" : "Receiver disabled · signing secret required"}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Webhook URL for this environment</p>
          <code className="block break-all rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs">{endpoint}</code>
          <button type="button" className="flex items-center gap-2 text-xs text-orange-300" onClick={async () => {
            try { await navigator.clipboard.writeText(endpoint); setCopied(true); setCopyFailed(false); }
            catch { setCopyFailed(true); }
          }}><Copy className="size-3.5" />{copied ? "Copied webhook URL" : "Copy webhook URL"}</button>
          {copyFailed && <p role="alert" className="text-xs text-rose-300">Clipboard unavailable. Select and copy the URL above.</p>}
        </div>
        <ol className="list-decimal pl-5 space-y-3 text-sm text-zinc-300">
          <li>In the Replit workspace, open <strong>Tools → Secrets</strong>. Add <code className="text-orange-300">SENTRY_WEBHOOK_SECRET</code> with your Sentry integration’s signing secret using the secure secret input.</li>
          <li>Restart the API workflow after saving the secret, then check the connection below.</li>
          <li>In Sentry, set the webhook URL above. Include <code>github.repository</code> and <code>github.branch</code> event tags, or provide <code>repository</code>, <code>branch</code>, and <code>stack_trace</code> in a JSON delivery.</li>
        </ol>
        <p className="text-xs text-zinc-500">This shared dashboard has no administrator sign-in, so it cannot safely accept or replace signing secrets. The value is never returned to this app or stored in your browser. Sentry signs the exact request body with HMAC-SHA256 in the <code>sentry-hook-signature</code> header.</p>
        <p className="text-xs text-zinc-500">Use a stable published URL in Sentry for production. Configuration status confirms the secret is present, not that a Sentry delivery has succeeded.</p>
        <button type="button" disabled={checking} onClick={onCheck} className="flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50">
          {checking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Check connection
        </button>
      </DialogContent>
    </Dialog>
  );
}
