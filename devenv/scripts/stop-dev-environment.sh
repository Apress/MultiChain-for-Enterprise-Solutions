#!/bin/bash
# Stops and removes the dev environment. Pass -v to also delete the
# named volumes (multichain-*-data), which wipes chain state.
set -e
cd "$(dirname "$0")/.."

docker compose stop
