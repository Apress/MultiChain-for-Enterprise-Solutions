#!/bin/bash
# Creates the streams defined in Chapter 6's data model and grants the
# write permissions implied by the Chapter 4 actor roster (Table 4.3).
# Run once, automatically, by the seed node's entrypoint.

CHAIN_NAME="$1"
DATADIR="$2"
RPC_USER="$3"
RPC_PASS="$4"
RPC_PORT="$5"

cli() {
  multichain-cli "${CHAIN_NAME}" -datadir="${DATADIR}" \
    -rpcuser="${RPC_USER}" -rpcpassword="${RPC_PASS}" -rpcport="${RPC_PORT}" "$@"
}

echo "Waiting for RPC to accept connections..."
until cli getinfo >/dev/null 2>&1; do sleep 2; done

# Streams from Chapter 6 (Sections 6.2-6.3): each business event type
# gets its own stream so retention, permissioning, and off-chain
# hashing policy can differ per event type.
for STREAM in award-events redemption-events correction-events offboarding-events audit-index; do
  echo "Creating stream: ${STREAM}"
  cli create stream "${STREAM}" true '{"chapter6-purpose":"see Table 6.2"}' || true
  cli subscribe "${STREAM}" || true
done

# The administrator role (Rewards Program Administrator, Table 4.3)
# is the only role with default write permission on award-events and
# correction-events; the API layer enforces the dual-admin rule from
# Workflow WF-7 above and beyond this base chain permission.
ADMIN_ADDR=$(cli getnewaddress)
cli grant "${ADMIN_ADDR}" admin,connect,send,receive
cli grantfrom "${ADMIN_ADDR}" "${ADMIN_ADDR}" award-events.write,redemption-events.write,correction-events.write,offboarding-events.write,audit-index.write 2>/dev/null || true

echo "${ADMIN_ADDR}" > "${DATADIR}/${CHAIN_NAME}/admin-address.txt"
echo "Bootstrap complete. Administrator address recorded in admin-address.txt"
