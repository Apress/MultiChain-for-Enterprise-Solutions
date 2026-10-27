#!/bin/bash
set -e

CHAIN_NAME="${CHAIN_NAME:-meridianrewards}"
RPC_PORT="${RPC_PORT:-9741}"
NETWORK_PORT="${NETWORK_PORT:-9740}"
DATADIR="/root/.multichain"

conf_dir="${DATADIR}/${CHAIN_NAME}"

if [ "${NODE_ROLE}" = "seed" ]; then

  if [ ! -d "${conf_dir}" ]; then
    echo "[${NODE_REGION}] Creating chain ${CHAIN_NAME} (seed node)"
    multichain-util create "${CHAIN_NAME}" \
      -datadir="${DATADIR}" \
      -anyone-can-connect=false \
      -anyone-can-send=false \
      -anyone-can-receive=false

    cat >> "${conf_dir}/params.dat" <<EOF
# Chapter 6 data-model parameters
target-block-time=5
mining-diversity=0.3
maximum-block-size=4194304
anyone-can-mine=false
anyone-can-admin=false
anyone-can-activate=false
anyone-can-create=false
EOF
  fi

  cat > "${conf_dir}/multichain.conf" <<EOF
rpcuser=${RPC_USER}
rpcpassword=${RPC_PASSWORD}
rpcport=${RPC_PORT}
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
port=${NETWORK_PORT}
autosubscribe=streams
EOF

  echo "[${NODE_REGION}] Starting seed node"
  multichaind "${CHAIN_NAME}" -datadir="${DATADIR}" -daemon \
    -rpcuser="${RPC_USER}" -rpcpassword="${RPC_PASSWORD}" \
    -rpcport="${RPC_PORT}" -rpcallowip=0.0.0.0/0 -port="${NETWORK_PORT}"

  sleep 3
  # Bootstrap the streams and permissioning scheme defined in Chapter 6
  # (award-events, redemption-events, correction-events, audit-index).
  /bootstrap-streams.sh "${CHAIN_NAME}" "${DATADIR}" "${RPC_USER}" "${RPC_PASSWORD}" "${RPC_PORT}" || true

else

  echo "[${NODE_REGION}] Waiting for seed node ${SEED_HOST}:${SEED_NETWORK_PORT}"
  until nc -z "${SEED_HOST}" "${SEED_NETWORK_PORT}"; do sleep 2; done

  if [ ! -d "${conf_dir}" ]; then
    echo "[${NODE_REGION}] Connecting to chain ${CHAIN_NAME} via ${SEED_HOST}:${SEED_NETWORK_PORT}"
    multichaind "${CHAIN_NAME}@${SEED_HOST}:${SEED_NETWORK_PORT}" \
      -datadir="${DATADIR}" -daemon \
      -rpcuser="${RPC_USER}" -rpcpassword="${RPC_PASSWORD}" \
      -rpcport="${RPC_PORT}" -rpcallowip=0.0.0.0/0 -port="${NETWORK_PORT}"
  fi

  cat > "${conf_dir}/multichain.conf" <<EOF
rpcuser=${RPC_USER}
rpcpassword=${RPC_PASSWORD}
rpcport=${RPC_PORT}
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
port=${NETWORK_PORT}
autosubscribe=streams
EOF

fi

echo "[${NODE_REGION}] Node is up. Tailing debug.log"
tail -f "${conf_dir}/debug.log"
