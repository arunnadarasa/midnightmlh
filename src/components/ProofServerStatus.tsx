import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "down" | "unconfigured";

/**
 * Polls VITE_PROOF_SERVER_URL /health every 5s and renders a small pill.
 * Fly-hosted proof server (see README) — red pill means the Publish flow
 * will fall back to a simulated state instead of a real ZK proof.
 */
export function ProofServerStatus({ compact = false }: { compact?: boolean }) {
  const url = import.meta.env.VITE_PROOF_SERVER_URL as string | undefined;
  const [status, setStatus] = useState<Status>(url ? "checking" : "unconfigured");
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const check = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${url.replace(/\/$/, "")}/health`, {
          method: "GET",
          mode: "cors",
        });
        if (cancelled) return;
        if (r.ok) {
          setStatus("ok");
          setLatency(Math.round(performance.now() - t0));
        } else {
          setStatus("down");
          setLatency(null);
        }
      } catch {
        if (cancelled) return;
        setStatus("down");
        setLatency(null);
      }
    };
    void check();
    const iv = setInterval(() => void check(), 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [url]);

  const dot =
    status === "ok"
      ? "bg-emerald-500"
      : status === "down"
        ? "bg-destructive"
        : status === "checking"
          ? "bg-amber-500 animate-pulse"
          : "bg-muted-foreground";

  const label =
    status === "ok"
      ? `proof server · ${latency ?? "?"}ms`
      : status === "down"
        ? "proof server · unreachable"
        : status === "checking"
          ? "proof server · checking"
          : "proof server · not configured";

  return (
    <div
      className={`inline-flex items-center gap-2 ${compact ? "text-[10px]" : "text-[11px]"} font-mono`}
      title={url ?? "VITE_PROOF_SERVER_URL not set"}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span className="opacity-70">{label}</span>
    </div>
  );
}
