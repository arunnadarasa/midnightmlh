# Use your Fly.io token to deploy the Midnight `undeployed` stack

You have a Fly API token — perfect. Here's how we'll wire it in without you needing Docker or a laptop.

## Step 1 — Save the token as a Lovable secret

Store it as `FLY_API_TOKEN` (Fly's own env-var name — `flyctl` picks it up automatically). Nothing in the frontend touches it; it's only used by shell commands we run for you.

## Step 2 — Deploy the three Fly apps from the Lovable sandbox

Once the token is saved I can run, from the sandbox on your behalf:

```bash
export FLY_API_TOKEN=$FLY_API_TOKEN
curl -L https://fly.io/install.sh | sh
flyctl apps create mn-proof-<slug>
flyctl apps create mn-node-<slug>
flyctl apps create mn-indexer-<slug>
flyctl deploy --config fly.proof.toml
flyctl deploy --config fly.node.toml     # + volume create
flyctl deploy --config fly.indexer.toml  # + volume create
flyctl scale count 1 -a <each-app> --yes
```

I'll materialise the three `fly.*.toml` files (already documented in README) into the repo, pick a `<slug>` (e.g. `choreo-kits`), and run each deploy sequentially so you see the URLs land.

## Step 3 — Auto-populate the app's env vars

After each deploy prints a hostname, I'll set the five `VITE_*` values in Project Settings as secrets so the running preview flips its status pills from red → green.

## Step 4 — Deploy the Compact contract

The Compact compiler + `bun scripts/deploy-midnight.mjs` still need to run somewhere with the Midnight SDK. Two options:

- **A. From the Lovable sandbox** — I try to install the Compact compiler in the sandbox and run the deploy script against your Fly proof server. Fastest for you, but the sandbox may block the installer (same class of restriction Midnight's own skill flags for `get.daml.com` / `compact-installer.sh`). If it does, fall back to B.
- **B. From a GitHub Codespace on your phone** — you open a Codespace (2 taps in the GitHub mobile web UI), paste the four commands from the README, and paste the hex contract address back into the app.

I'd try A first automatically. If it blocks, I stop and hand you the B instructions.

## What I need from you before Build mode

Two quick answers, then approve the plan and I'll execute:

1. **Slug** for the three Fly apps? Default: `choreo-kits` → `mn-proof-choreo-kits.fly.dev` etc.
2. **Region** — keep `lhr` (London) or pick another closer to judges?

## Technical details

- Token stored as `FLY_API_TOKEN` — the exact env var `flyctl` reads, so no wrapper needed.
- `fly.proof.toml`, `fly.node.toml`, `fly.indexer.toml` will be written to the repo root; they're just the TOML blocks from README §§2–4.
- Volumes (`node_data` 10 GB, `idx_data` 3 GB) created before first `deploy` so the stateful containers boot clean.
- `count 1` + `auto_stop_machines=false` + `min_machines_running=1` on every app — mandatory for stateful Midnight nodes (same invariant as the Canton skill).
- Compact deploy in Step 4 writes to `src/data/midnight-contract.json`; the DeployPanel already reads it.
- Estimated Fly cost while the stack runs: ~$0.03/hr total ($20/mo if left up).