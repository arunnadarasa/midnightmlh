import { useEffect, useState } from "react";

type Probe = {
  name: string;
  url: string | undefined;
  method: "GET" | "POST";
  path?: string;
  body?: unknown;
};

type Result = "checking" | "ok" | "down" | "unconfigured";

function host(u?: string) {
  if (!u) return "not set";
  try {
    return new URL(u).host;
  } catch {
    return u.replace(/^wss?:\/\//, "").replace(/\/.*$/, "");
  }
}

/**
 * Footer strip showing the three Fly-hosted Midnight services (node,
 * indexer, proof server) with live green/red dots. Judges see immediately
 * that this is real infra.
 */
export function StackStatusBar() {
  const indexerUrl = import.meta.env.VITE_INDEXER_URL as string | undefined;
  const proofUrl = import.meta.env.VITE_PROOF_SERVER_URL as string | undefined;
  const nodeWs = import.meta.env.VITE_NODE_WS as string | undefined;

  const probes: Probe[] = [
    {
      name: "proof server",
      url: proofUrl,
      method: "GET",
      path: "/health",
    },
    {
      name: "indexer",
      url: indexerUrl,
      method: "POST",
      body: { query: "{ __typename }" },
    },
  ];

  const [results, setResults] = useState<Record<string, Result>>({
    "proof server": proofUrl ? "checking" : "unconfigured",
    indexer: indexerUrl ? "checking" : "unconfigured",
    node: nodeWs ? "checking" : "unconfigured",
  });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const next: Record<string, Result> = { ...results };
      await Promise.all(
        probes.map(async (p) => {
          if (!p.url) {
            next[p.name] = "unconfigured";
            return;
          }
          const target = `${p.url.replace(/\/$/, "")}${p.path ?? ""}`;
          try {
            const r = await fetch(target, {
              method: p.method,
              mode: "cors",
              headers: p.body ? { "Content-Type": "application/json" } : undefined,
              body: p.body ? JSON.stringify(p.body) : undefined,
            });
            next[p.name] = r.ok ? "ok" : "down";
          } catch {
            next[p.name] = "down";
          }
        }),
      );

      // Node: WS handshake via fetch returns non-ok but reachable = "ok-ish".
      // Cheapest heuristic: try a plain fetch on the https host; any response = up.
      if (nodeWs) {
        try {
          const httpsHost = nodeWs.replace(/^wss?:\/\//, "https://");
          const r = await fetch(httpsHost, { method: "GET", mode: "no-cors" });
          next["node"] = r.type === "opaque" || r.ok ? "ok" : "down";
        } catch {
          next["node"] = "down";
        }
      }
      if (!cancelled) setResults(next);
    };
    void check();
    const iv = setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexerUrl, proofUrl, nodeWs]);

  const services = [
    { key: "node", url: nodeWs },
    { key: "indexer", url: indexerUrl },
    { key: "proof server", url: proofUrl },
  ];

  return (
    <div className="border border-border rounded-md bg-card p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Fly-hosted Midnight stack
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {services.map((s) => {
          const r = results[s.key] ?? "unconfigured";
          const dot =
            r === "ok"
              ? "bg-emerald-500"
              : r === "down"
                ? "bg-destructive"
                : r === "checking"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-muted-foreground";
          return (
            <li
              key={s.key}
              className="flex items-center gap-2 text-[11px] font-mono border border-border/60 rounded px-2 py-1.5"
              title={s.url ?? "not configured"}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
              <span className="opacity-70">{s.key}</span>
              <span className="opacity-50 truncate ml-auto">{host(s.url)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
