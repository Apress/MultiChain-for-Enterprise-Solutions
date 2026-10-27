// Thin wrapper around the MultiChain JSON-RPC interface.
// This is the ONLY module in the codebase that knows how to talk to
// the chain. Every service in src/services calls through here rather
// than building RPC calls itself, so the chain can later be swapped
// for MultiChain Enterprise Edition (Section 7.9) or fronted by an
// adapter for a different DLT (Section 7.10) without touching
// business logic elsewhere.

const axios = require('axios');

const {
  MULTICHAIN_HOST,
  MULTICHAIN_RPC_PORT,
  MULTICHAIN_RPC_USER,
  MULTICHAIN_RPC_PASSWORD,
  MULTICHAIN_CHAIN_NAME
} = process.env;

const rpcUrl = `http://${MULTICHAIN_HOST}:${MULTICHAIN_RPC_PORT}`;

let requestId = 0;

async function rpc(method, params = []) {
  requestId += 1;
  const body = {
    method,
    params,
    id: requestId,
    chain_name: MULTICHAIN_CHAIN_NAME
  };

  const response = await axios.post(rpcUrl, body, {
    auth: {
      username: MULTICHAIN_RPC_USER,
      password: MULTICHAIN_RPC_PASSWORD
    },
    headers: { 'Content-Type': 'application/json' }
  });

  if (response.data.error) {
    const err = new Error(response.data.error.message || 'MultiChain RPC error');
    err.code = response.data.error.code;
    err.method = method;
    throw err;
  }

  return response.data.result;
}

// Publish a JSON payload to a stream, keyed by the given key(s).
// This is the on-chain write primitive every workflow in Section 7.3
// is built from.
async function publish(streamName, key, jsonPayload) {
  const hex = Buffer.from(JSON.stringify(jsonPayload), 'utf8').toString('hex');
  return rpc('publish', [streamName, key, { json: jsonPayload }]);
}

async function listStreamKeyItems(streamName, key, verbose = true, count = 50) {
  return rpc('liststreamkeyitems', [streamName, key, verbose, count]);
}

async function listStreamItems(streamName, verbose = true, count = 50) {
  return rpc('liststreamitems', [streamName, verbose, count]);
}

module.exports = { rpc, publish, listStreamKeyItems, listStreamItems };
