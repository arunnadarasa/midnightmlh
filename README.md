# Tokenized Choreo Kits

**Sell bundled choreography sequences as tokenized, licensable assets on Midnight.**
Single-page Midnight ZK demo — Compact 0.23 contract, Lace wallet, real proof server.

> Built during the **Creative AI & Quantum Hackathon** organised by StreetKode Fam
> during Indian Krump Festival 14.

**Primary deployment target: [Fly.io](https://fly.io) — a fully public Midnight
`undeployed` stack (node · indexer · proof server) reachable at
`https://mn-*-<slug>.fly.dev`.** No Docker required to demo. Cost during the
hackathon window: ~$20–30. Teardown is one command.

## The idea

Choreographers today have no privacy-preserving way to license routines. Post it
publicly and anyone can copy it; keep it private and you can't sell it. Midnight's
ZK ledger lets us publish the **kit** (title, steps, price) while keeping the
**author's identity** hidden behind a per-entry commitment. Buyers see verifiable
provenance; sellers stay pseudonymous.

## Hackathon fit

Targeted at the **DeFi Track** (tokenized/licensable content) with strong overlap
into Gaming/Creative and Best Beginner Hack.

| Criterion | How this project addresses it |
| --- | --- |
| **Technology** | Compact 0.23 ZK circuit, `persistentHash` author commitment, `disclose()` boundary. Real proof server on Fly.io — not stubbed. |
| **Originality** | ZK for choreography IP is an unexplored niche. Also: **first known public writeup of running the Midnight `undeployed` stack on Fly.io** (see below), enabling phone-only submissions from anywhere. |
| **Execution** | One polished page. Real "Proving… 30–120s" UX. Live status pills for node / indexer / proof server. |
| **Completion** | End-to-end: connect → deploy → publish → browse. All in a single index route. |
| **Documentation** | This README covers Fly.io bring-up, contract deploy, and the criteria mapping in under 5 minutes. |
| **Business value** | MVP for a choreography licensing marketplace — creators keep pseudonymity, buyers get provable authorship. |

## Stack

- Vite + React (TanStack Start template, single index route).
- Compact 0.23 contract → real proof server on port `:6300`.
- Lace wallet is the sole auth surface.
- All Midnight code paths gated behind `<ClientOnly>` for SSR safety.
- **Midnight `undeployed` stack hosted on Fly.io** — three tiny apps, one org.

## Contract

See [`contracts/TokenizedChoreoKits.compact`](./contracts/TokenizedChoreoKits.compact).
Public ledger: `kit_count`, `last_kit` (JSON blob), `last_author_commitment`.
Private witness: `localSecretKey()` → per-user 32-byte value in `localStorage`.
Circuit: `publishKit(payload)` writes the commitment + payload and bumps the counter.

---

## Undeployed on Fly.io

The Midnight local stack (node + indexer + proof server) normally lives in
Docker on your laptop. This project ships it as **three tiny Fly.io apps**
instead, so anyone with a browser (including a phone) can run the demo end
to end without installing Docker.

Reusing the invariants from the sibling
[`canton-fly-deploy`](./NHS%20Canton) playbook:

1. **Exactly one machine per app** — Midnight's node and indexer are stateful.
   `fly scale count 1 -a <app> --yes` after every deploy.
2. **`auto_stop_machines = false` + `min_machines_running = 1`** — no
   cold-starts mid-judging.
3. **`force_https = true`** — fly-proxy terminates TLS + WSS for us.
4. **`lhr` region** by default. Swap if your judges are elsewhere.

### 1. Install flyctl (from a Codespace or your laptop)

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

### 2. Deploy the proof server (stateless)

```toml
# fly.proof.toml
app = "mn-proof-<slug>"
primary_region = "lhr"

[build]
  image = "midnightntwrk/proof-server:latest"

[http_service]
  internal_port = 6300
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 2048
```

```bash
flyctl launch --config fly.proof.toml --copy-config --no-deploy
flyctl deploy --config fly.proof.toml
flyctl scale count 1 -a mn-proof-<slug> --yes
```

### 3. Deploy the node (stateful — volume + count=1)

```toml
# fly.node.toml
app = "mn-node-<slug>"
primary_region = "lhr"

[build]
  image = "midnightntwrk/midnight-node:latest"     # pin from midnight-local-dev's compose.yaml
  # cmd: --chain=undeployed --dev --rpc-external --unsafe-rpc-external --rpc-cors=all
  # (set via `flyctl deploy --command` or in a Dockerfile wrapper)

[[mounts]]
  source = "node_data"
  destination = "/data"

[http_service]
  internal_port = 9944
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 4096
```

```bash
flyctl launch --config fly.node.toml --copy-config --no-deploy
flyctl volumes create node_data -a mn-node-<slug> --region lhr --size 10
flyctl deploy --config fly.node.toml
flyctl scale count 1 -a mn-node-<slug> --yes
```

### 4. Deploy the indexer (stateful — SQLite volume)

```toml
# fly.indexer.toml
app = "mn-indexer-<slug>"
primary_region = "lhr"

[build]
  image = "midnightntwrk/indexer-standalone:latest"

[env]
  NODE_URL = "ws://mn-node-<slug>.internal:9944"
  LEDGER_STATE_STORAGE_MODE = "sqlite"

[[mounts]]
  source = "idx_data"
  destination = "/data"

[http_service]
  internal_port = 8088
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 2048
```

```bash
flyctl launch --config fly.indexer.toml --copy-config --no-deploy
flyctl volumes create idx_data -a mn-indexer-<slug> --region lhr --size 3
flyctl deploy --config fly.indexer.toml
flyctl scale count 1 -a mn-indexer-<slug> --yes
```

### 5. Smoke test (30 seconds)

```bash
curl -s https://mn-proof-<slug>.fly.dev/health                  # → {"status":"ok",...}
curl -s -X POST https://mn-indexer-<slug>.fly.dev/api/v3/graphql \
     -H "content-type: application/json" \
     -d '{"query":"{__typename}"}'                              # → { "data": { ... } }
curl -sI https://mn-node-<slug>.fly.dev                         # → HTTP handshake reply
```

If a call fails, capture the full response body (don't swallow it) and check
`flyctl logs -a <app>` — same debugging discipline as the Canton playbook.

### 6. Wire Lovable env vars

In Project Settings → Secrets (or `.env` locally):

```
VITE_NETWORK_ID=undeployed
VITE_NODE_WS=wss://mn-node-<slug>.fly.dev
VITE_INDEXER_URL=https://mn-indexer-<slug>.fly.dev/api/v3/graphql
VITE_INDEXER_WS_URL=wss://mn-indexer-<slug>.fly.dev/api/v3/graphql/ws
VITE_PROOF_SERVER_URL=https://mn-proof-<slug>.fly.dev
```

The `StackStatusBar` in the app footer polls all three and flips green/red live.

### 7. Deploy the Compact contract

From the same Codespace (or your laptop):

```bash
compact compile contracts/TokenizedChoreoKits.compact contracts/managed/tokenized-choreo-kits
cp -r contracts/managed/tokenized-choreo-kits/keys public/keys
cp -r contracts/managed/tokenized-choreo-kits/zkir public/zkir

# points at the Fly proof server via VITE_PROOF_SERVER_URL
VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs
# → prints hex contract address, paste into the app's Deploy panel
```

Lace should be pointed at the Fly node:
**Lace Settings → Network → Custom → `wss://mn-node-<slug>.fly.dev`**.

### 8. Teardown (do this after the hackathon)

```bash
fly apps destroy mn-node-<slug> mn-indexer-<slug> mn-proof-<slug>
```

---

## Local Docker (fallback)

If you'd rather run everything locally:

```bash
compact compile contracts/TokenizedChoreoKits.compact contracts/managed/tokenized-choreo-kits
cp -r contracts/managed/tokenized-choreo-kits/keys public/keys
cp -r contracts/managed/tokenized-choreo-kits/zkir public/zkir
bun scripts/midnight-standalone.mjs up   # first run pulls ~1 GB
VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs
```

Point Lace at `ws://localhost:9944`. Use the commented `.env` block in
`.env.example` for the local URLs.

## Run the app

```bash
cp .env.example .env   # fill in the Fly hostnames
bun install
bun run dev
```

## Explicit non-goals

- No IPFS/Pinata — kit content is inline JSON.
- No AI Gateway calls (yet).
- No transfer/resale logic — v1 is the license record. Marketplace tx flow is
  a natural v2 using the same contract shape.
- No tests, no CI. Ship the demo.

## Credits

Built during the **Creative AI & Quantum Hackathon** organised by StreetKode Fam
during Indian Krump Festival 14. Fly.io deployment pattern adapted from the
[`canton-fly-deploy`](./NHS%20Canton) skill developed for NHS Canton.
