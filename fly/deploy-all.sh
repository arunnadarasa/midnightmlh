#!/usr/bin/env bash
# Deploy the Midnight `undeployed` stack (node + indexer + proof server) to Fly.io.
#
# Requires:
#   - $FLY_API_TOKEN in the environment (or `flyctl auth login` done)
#   - flyctl installed (script installs it if missing)
#
# Usage (from a GitHub Codespace, Fly web console, or any Linux/Mac shell):
#   export FLY_API_TOKEN="FlyV1 fm2_..."
#   bash fly/deploy-all.sh
#
# Idempotent: re-running is safe; `apps create` / `volumes create` swallow "already exists".

set -euo pipefail

if [[ -z "${FLY_API_TOKEN:-}" ]]; then
  echo "ERROR: FLY_API_TOKEN not set." >&2
  echo "Export it first:  export FLY_API_TOKEN='FlyV1 fm2_...'" >&2
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "==> Installing flyctl"
  curl -L https://fly.io/install.sh | sh
  export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
  export PATH="$FLYCTL_INSTALL/bin:$PATH"
fi

flyctl version
flyctl auth whoami

REGION="${FLY_REGION:-lhr}"
ORG="${FLY_ORG:-personal}"

deploy_app() {
  local config="$1"
  local app
  app="$(grep -m1 '^app' "$config" | sed -E 's/app *= *"([^"]+)"/\1/')"

  echo ""
  echo "======================================================"
  echo " Deploying $app  ($config)"
  echo "======================================================"

  flyctl apps create "$app" --org "$ORG" 2>&1 | grep -v "already been taken" || true

  # Stateful apps: create volume before first deploy.
  case "$app" in
    mn-node-*)
      flyctl volumes create node_data --app "$app" --region "$REGION" --size 10 --yes 2>&1 \
        | grep -Ev "already exists|already have" || true
      ;;
    mn-indexer-*)
      flyctl volumes create idx_data --app "$app" --region "$REGION" --size 3 --yes 2>&1 \
        | grep -Ev "already exists|already have" || true
      ;;
  esac

  flyctl deploy --config "$config" --app "$app" --region "$REGION" --ha=false --yes
  flyctl scale count 1 --app "$app" --yes || true
}

HERE="$(cd "$(dirname "$0")" && pwd)"

# Order matters: proof server is stateless (fastest feedback),
# then node (indexer depends on it), then indexer.
deploy_app "$HERE/fly.proof.toml"
deploy_app "$HERE/fly.node.toml"
deploy_app "$HERE/fly.indexer.toml"

echo ""
echo "======================================================"
echo " All three apps deployed. Public URLs:"
echo "======================================================"
echo "  Proof server : https://mn-proof-choreo-kits.fly.dev"
echo "  Node (WSS)   : wss://mn-node-choreo-kits.fly.dev"
echo "  Indexer      : https://mn-indexer-choreo-kits.fly.dev/api/v3/graphql"
echo ""
echo "Smoke test:"
echo "  curl -s https://mn-proof-choreo-kits.fly.dev/health"
echo "  curl -s -X POST https://mn-indexer-choreo-kits.fly.dev/api/v3/graphql \\"
echo "       -H 'content-type: application/json' -d '{\"query\":\"{__typename}\"}'"
echo ""
echo "Then paste these into Lovable Project Settings → Secrets:"
echo "  VITE_NETWORK_ID=undeployed"
echo "  VITE_NODE_WS=wss://mn-node-choreo-kits.fly.dev"
echo "  VITE_INDEXER_URL=https://mn-indexer-choreo-kits.fly.dev/api/v3/graphql"
echo "  VITE_INDEXER_WS_URL=wss://mn-indexer-choreo-kits.fly.dev/api/v3/graphql/ws"
echo "  VITE_PROOF_SERVER_URL=https://mn-proof-choreo-kits.fly.dev"
