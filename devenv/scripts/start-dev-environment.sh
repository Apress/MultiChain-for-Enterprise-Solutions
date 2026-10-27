#!/bin/bash
# Builds (only if needed) and starts the full Chapter 7 development environment:
# three MultiChain Community Edition nodes (US/UK/India), three
# region-scoped WireMock mock servers, the Node.js API, and the
# Streamlit UI. See ../docs/setup-guide.md for the walkthrough this
# script automates.
#
# Usage:
#   ./start-dev-environment.sh            # build only if images are missing, then start
#   ./start-dev-environment.sh --rebuild  # force a rebuild (use after changing code/Dockerfiles)

set -e
cd "$(dirname "$0")/.."

FORCE_REBUILD=false
if [[ "$1" == "--rebuild" ]]; then
  FORCE_REBUILD=true
fi

# Returns 0 if every service that has a build: section already has an image.
images_exist() {
  local missing=0
  # `docker compose config --images` lists the image name for every service
  while read -r image; do
    [[ -z "$image" ]] && continue
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      echo "    missing image: $image"
      missing=1
    fi
  done < <(docker compose config --images)
  return $missing
}

if $FORCE_REBUILD; then
  echo "==> --rebuild requested, building images"
  docker compose build
elif images_exist; then
  echo "==> Images already exist, skipping build"
else
  echo "==> One or more images missing, building"
  docker compose build
fi

echo "==> Starting MultiChain nodes and mocks first (API/UI depend on them)"
docker compose up -d multichain-us multichain-uk multichain-india wiremock-us wiremock-uk wiremock-india

# Only wait for bootstrap if the seed node was freshly created/started
if [[ -z "$(docker compose ps -q --status running multichain-us 2>/dev/null)" ]]; then
  echo "==> Waiting 20s for the seed node to bootstrap streams"
  sleep 20
else
  echo "==> Seed node already running, short wait for readiness"
  sleep 3
fi

echo "==> Starting the API and UI"
docker compose up -d rewards-api rewards-ui

echo "==> Environment is up:"
echo "    Streamlit UI:       http://localhost:8501"
echo "    Node.js API:        http://localhost:4000/health"
echo "    MultiChain US RPC:  http://localhost:9741"
echo "    MultiChain UK RPC:  http://localhost:9742"
echo "    MultiChain IN RPC:  http://localhost:9744"
echo "    WireMock US:        http://localhost:8081/__admin"
echo "    WireMock UK:        http://localhost:8082/__admin"
echo "    WireMock India:     http://localhost:8083/__admin"