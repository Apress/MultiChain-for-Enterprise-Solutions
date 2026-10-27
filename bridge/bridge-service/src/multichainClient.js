'use strict';

/**
 * multichainClient.js
 *
 * Minimal JSON-RPC client for the Meridian Rewards MultiChain node.
 *
 * This talks to the same JSON-RPC port that Chapter 6.11's multichain-cli
 * commands use under the hood (default 8570 in the development
 * docker-compose.yml from Listing 6.3). Every method here has a direct
 * multichain-cli equivalent, named the same way, so a reader who has
 * already run the Chapter 6.11 walkthrough by hand will recognize each
 * call immediately.
 *
 * This client does not implement authentication beyond basic auth over
 * the RPC connection, matching the -rpcuser / -rpcpassword flags used
 * in Listing 6.3's docker-compose.yml.
 */

const http = require('http');

class MultiChainClient {
  constructor({ host, port, rpcUser, rpcPassword, chainName }) {
    this.host = host;
    this.port = port;
    this.rpcUser = rpcUser;
    this.rpcPassword = rpcPassword;
    this.chainName = chainName; // informational only; RPC endpoint is per-node
    this._id = 0;
  }

  /**
   * Low-level JSON-RPC call. Mirrors `multichain-cli <chain> <method> <params...>`.
   */
  _call(method, params = []) {
    const payload = JSON.stringify({
      jsonrpc: '1.0',
      id: ++this._id,
      method,
      params,
    });

    const auth = Buffer.from(`${this.rpcUser}:${this.rpcPassword}`).toString('base64');

    const options = {
      host: this.host,
      port: this.port,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Basic ${auth}`,
      },
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              reject(new Error(`MultiChain RPC error on ${method}: ${JSON.stringify(parsed.error)}`));
            } else {
              resolve(parsed.result);
            }
          } catch (err) {
            reject(new Error(`Failed to parse MultiChain RPC response for ${method}: ${err.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Equivalent of:
   *   multichain-cli meridian-rewards-dev liststreamitems <stream> <count> <start>
   *
   * Used by the bridge service's polling loop (see index.js) to find
   * newly confirmed bridge_transaction records, per Listing 10.1's schema.
   */
  async listStreamItems(stream, count = 50, start = -count) {
    return this._call('liststreamitems', [stream, false, count, start]);
  }

  /**
   * Equivalent of:
   *   multichain-cli meridian-rewards-dev liststreamkeyitems <stream> <key>
   *
   * Used to retrieve every bridge_transaction record for a specific
   * transaction_ref or employee_ref, matching Section 6.2's multi-key
   * retrieval pattern.
   */
  async listStreamKeyItems(stream, key) {
    return this._call('liststreamkeyitems', [stream, key]);
  }

  /**
   * Equivalent of:
   *   multichain-cli meridian-rewards-dev publish <stream> <keys> <data>
   *
   * Used to write the counterparty confirmation back onto the
   * interoperability stream, per Section 10.4 and Section 10.5's step 6
   * ("the resulting Ethereum transaction hash is written back to
   * MultiChain, cross-referenced to the original bridge_transaction
   * record").
   */
  async publish(stream, keys, jsonData) {
    const payload = { json: jsonData };
    return this._call('publish', [stream, keys, payload]);
  }

  /**
   * Equivalent of:
   *   multichain-cli meridian-rewards-dev getaddressbalances <address>
   *
   * Used only for local verification during development; not part of
   * the bridge service's production write path.
   */
  async getAddressBalances(address, minConf = 1, includeLocked = false) {
    return this._call('getaddressbalances', [address, minConf, includeLocked]);
  }
}

module.exports = { MultiChainClient };
