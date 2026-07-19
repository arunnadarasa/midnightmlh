
# Midnight `undeployed` on Fly.io — reusing your Canton playbook

Confirmed you have working Fly.io experience via the `canton-fly-deploy` skill in **NHS Canton**. Reusing those invariants directly:
- Stateful nodes → **exactly one Fly machine per app** (`flyctl scale count 1 --yes`)
- `auto_stop_machines = false`, `min_machines_running = 1`, `force_https = true`
- `lhr` region default (change if judges are elsewhere)
- Persist volumes for anything stateful

Lovable Cloud is optional. I'd skip it — nothing here needs a DB, and we already burned budget on the compact contract. If you want, I'll only enable Cloud to add a small AI Gateway "kit critique" server function so the app has a working live feature even if a Fly service hiccups during judging. Say the word.

## Architecture (three Fly apps, one org, private 6PN)

```text
                           ┌─────────────────────────────────┐
                    ┌─────▶│ mn-node-<slug>.fly.dev :9944    │  midnight-node
                    │ WSS  │  volume: node_data 10 GB        │  --chain=undeployed --dev
                    │      │  count=1, min_running=1         │  --rpc-external --rpc-cors=all
                    │      └────────────┬────────────────────┘
Lovable app (SSR)   │                   │ ws://mn-node.internal:9944
  VITE_NODE_WS ─────┘                   ▼
                    ┌─────────────────────────────────┐
  VITE_INDEXER_URL ▶│ mn-indexer-<slug>.fly.dev :8088 │  indexer-standalone
  VITE_INDEXER_WS ▶ │  volume: idx_data 3 GB (SQLite) │  NODE_URL=ws://mn-node.internal:9944
                    │  count=1, min_running=1         │  path: /api/v3/graphql(+/ws)
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
  VITE_PROOF_SERVER▶│ mn-proof-<slug>.fly.dev  :6300  │  proof-server (stateless)
                    │  count=1, min_running=1         │
                    └─────────────────────────────────┘
```

Sizes (mirroring your Canton `4 GB / shared-2` sizing):
- node: `shared-cpu-2x`, 4 GB, 10 GB volume (stateful chain DB)
- indexer: `shared-cpu-2x`, 2 GB, 3 GB volume (SQLite)
- proof-server: `shared-cpu-2x`, 2 GB, no volume

Estimated cost during hackathon window: ~$20–30. Destroy with `fly apps destroy mn-*` at T+24h.

## Reused Canton invariants (verbatim from the skill)

1. **Exactly one machine per app.** `flyctl scale count 1 -a <app> --yes` after every deploy.
2. **`auto_stop_machines = false` + `min_machines_running = 1`** so nothing cold-starts mid-demo.
3. **Health-check via 401/200 pattern** — for Midnight, `curl -o /dev/null -w "%{http_code}" https://mn-node-*.fly.dev` behaves the same way.
4. **Idempotent bootstrap** — pasting the contract address on redeploy is the Midnight equivalent of your DAR re-upload.
5. **Return raw response bodies on non-2xx** during smoke tests — don't swallow.

Midnight-specific differences from Canton:
- No JWT layer. Auth is Lace wallet signatures, not RS256. So no `CANTON_JWT_PRIVATE_KEY` equivalent — one fewer secret to manage.
- Three apps not one, because Midnight splits node / indexer / proof-server (Canton bundles all three inside the participant).
- Substrate WS on `:9944` needs `--rpc-external --unsafe-rpc-external --rpc-cors=all` for fly-proxy to terminate WSS.

## Hour-by-hour (T-7 → T-0, phone-only)

```text
T-7:00 → T-6:30  From Samsung: open Fly.io GUI OR a GitHub Codespace
                 (whichever your guest-house Wi-Fi allows). Install flyctl:
                 curl -L https://fly.io/install.sh | sh && flyctl auth login

T-6:30 → T-5:30  Three fly launches (in the shell). Exact commands come
                 out of the build step. For each app:
                 - fly launch --no-deploy --image <pinned>
                 - fly volume create <name> --region lhr --size <N>   (node/indexer)
                 - fly secrets set (indexer only: NODE_URL)
                 - fly deploy
                 - flyctl scale count 1 -a <app> --yes

T-5:30 → T-5:00  Smoke:
                 curl https://mn-proof-*.fly.dev/health          → 200
                 curl -I https://mn-node-*.fly.dev               → 200/400 (WS handshake)
                 curl -X POST https://mn-indexer-*.fly.dev/api/v3/graphql
                      -H "content-type: application/json"
                      -d '{"query":"{__typename}"}'              → 200

T-5:00 → T-4:30  Wire Lovable env vars (Project Settings → Secrets):
                 VITE_NETWORK_ID=undeployed
                 VITE_NODE_WS=wss://mn-node-<slug>.fly.dev
                 VITE_INDEXER_URL=https://mn-indexer-<slug>.fly.dev/api/v3/graphql
                 VITE_INDEXER_WS_URL=wss://mn-indexer-<slug>.fly.dev/api/v3/graphql/ws
                 VITE_PROOF_SERVER_URL=https://mn-proof-<slug>.fly.dev

T-4:30 → T-3:30  Code changes (small, additive — details below).
T-3:30 → T-2:30  Compile + deploy the Compact contract from Codespace,
                 paste hex into DeployPanel, watch KitFeed sync.
T-2:30 → T-1:00  README rewrite (Fly.io stack) + screen-record demo.
T-1:00 → T-0:00  Submit.
```

## Code changes (all additive, no rewrites)

- `.env.example` — replace `localhost` defaults with `wss://mn-*.fly.dev` template + a commented local block.
- `src/lib/use-midnight-wallet.ts` — no change; the `undeployed → preview → preprod` fallback already handles Lace network mismatches.
- `src/components/DeployPanel.tsx` — copy update: "Undeployed node hosted on Fly.io (`mn-node-<slug>.fly.dev`)." Keep the hex-paste flow.
- **NEW** `src/components/ProofServerStatus.tsx` — 5s poll of `${VITE_PROOF_SERVER_URL}/health`, green/red pill in header + inline near Publish button. If red → banner "Fly proof-server unreachable — proofs will fail. Retry in ~30s."
- **NEW** `src/components/StackStatusBar.tsx` — footer strip showing all three hostnames with green/red dots. Judges instantly see "this is real infra, not a mock."
- `README.md` — replace local-Docker section with an **"Undeployed on Fly.io"** section: three `fly.toml` snippets, the exact commands above, env-var mapping, cost estimate, and a `fly apps destroy mn-*` teardown line. Cite the Canton-fly-deploy skill as prior art.
- No contract changes.

## Optional: Lovable Cloud (only if you want a resilience-boost)

Enable Cloud only to add one AI Gateway server function (`src/lib/critique.functions.ts`) that takes `{ stepCount, tempoBucket, kitTitleHash }` and returns a short "originality critique." This is entirely optional — pure narrative padding for judging. Zero DB, zero auth. Says "Yes" if you want it added in the build pass; otherwise skip.

## Unknowns I still need (or say "you pick")

1. **Image tags** — pin whatever `midnightntwrk/midnight-local-dev`'s compose.yaml uses at HEAD. OK?
2. **Region** — default `lhr` (matches your Canton setup). Change if judges are elsewhere.
3. **AI critique server function** — add it or skip? (Requires Cloud enable, no other changes.)
4. **Codespaces vs Fly GUI** — which is more reliable on the guest-house Wi-Fi? I'll write both paths into the README either way; just tells me which one to lead with.

## Risks and mitigations

- **Substrate WS through fly-proxy** — `--rpc-external --unsafe-rpc-external --rpc-cors=all` are mandatory. First smoke test at T-5:30 confirms.
- **Indexer schema path drift** — if the pinned image ships `/api/v4/graphql`, we swap the env vars in one edit; the smoke test surfaces it in 30s.
- **Lace on undeployed via Fly** — desktop Lace pointed at `wss://mn-node-*.fly.dev` works; Lace mobile support for custom WS URLs is unproven. Fallback: screen-record desktop Lace connecting.
- **Compact compile from phone** — done in the Codespace or a throwaway Fly machine with the compiler image; not on the phone directly.
- **Cost overrun after event** — teardown one-liner in README: `fly apps destroy mn-node-<slug> mn-indexer-<slug> mn-proof-<slug>`.

## Not doing

- Not enabling Lovable Cloud unless you say yes to the AI critique add-on.
- Not touching the wallet hook, router shell, or contract source.
- Not fabricating successful proofs — ProofServerStatus drives an explicit "simulated" banner if the Fly proof-server is red.

Answer the four unknowns (or "you pick, go") and I'll switch to build mode, ship the code changes in one batch, then hand you copy-paste `fly launch / fly deploy` commands you can run from the Samsung.
