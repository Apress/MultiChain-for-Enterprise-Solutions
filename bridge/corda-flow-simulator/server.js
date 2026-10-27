'use strict';

/**
 * server.js  (corda-flow-simulator)
 *
 * IMPORTANT: this is a simulator, not a Corda node.
 *
 * A Node.js service cannot call Corda's native RPC client directly;
 * that client is JVM-only. Real enterprise Corda integrations solve
 * this by running a small webserver plugin on the Corda node itself,
 * written in Kotlin or Java, which exposes a chosen CorDapp flow over
 * HTTP. External services, like this book's bridge service, call that
 * REST endpoint rather than talking to Corda directly.
 *
 * This file simulates exactly that REST contract, so a reader can run
 * Chapter 10's Section 10.6 worked example end to end without needing
 * a live multi-bank consortium test network, which essentially no
 * individual reader (or this book's own build environment) has access
 * to. The production equivalent of this file is a real Spring Boot or
 * Corda webserver plugin, calling out to an actual CordaRPCClient
 * connected to a real notary. See docs/ARCHITECTURE.md for the mapping.
 *
 * Endpoints:
 *   POST /flows/settlement   Initiates a simulated settlement flow.
 *                            Body: { transactionRef, employeeRef, usdValue, participantBankId }
 *                            Returns: { flowId, status: "PENDING" }
 *
 *   GET  /flows/settlement/:flowId
 *                            Polls flow status. After a short simulated
 *                            notarization delay, transitions to
 *                            "NOTARIZED" and returns a synthetic
 *                            notary signature and settlement reference.
 */

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.CORDA_SIMULATOR_PORT || 9200;

// In-memory flow store. A real webserver plugin has no equivalent of
// this at all; flow state lives in the Corda node's own vault.
const flows = new Map();

// Simulated notarization delay, in milliseconds. Corda's actual
// finality timing depends on the notary cluster's configuration; this
// is a fixed stand-in purely for local development.
const SIMULATED_NOTARIZATION_DELAY_MS = 1500;

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function synthesizeNotarySignature(flowId) {
  // Stands in for the notary's actual cryptographic signature over
  // the finalized transaction. Never treat this as a real signature;
  // it exists only so downstream code has a stable-looking field to
  // parse and log during local development.
  return crypto.createHash('sha256').update(`notary-sim:${flowId}`).digest('hex');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/flows/settlement') {
      const body = await readBody(req);
      const { transactionRef, employeeRef, usdValue, participantBankId } = body;

      if (!transactionRef || !usdValue || !participantBankId) {
        return sendJson(res, 400, {
          error: 'transactionRef, usdValue, and participantBankId are required',
        });
      }

      const flowId = crypto.randomUUID();
      flows.set(flowId, {
        flowId,
        transactionRef,
        employeeRef: employeeRef || null,
        usdValue,
        participantBankId,
        status: 'PENDING',
        createdAt: Date.now(),
      });

      // Simulate the notary finalizing the flow asynchronously.
      setTimeout(() => {
        const flow = flows.get(flowId);
        if (flow) {
          flow.status = 'NOTARIZED';
          flow.notarySignature = synthesizeNotarySignature(flowId);
          flow.settlementRef = `corda-settle-${flowId}`;
          flow.notarizedAt = Date.now();
        }
      }, SIMULATED_NOTARIZATION_DELAY_MS);

      return sendJson(res, 202, { flowId, status: 'PENDING' });
    }

    const statusMatch = req.method === 'GET' && req.url.match(/^\/flows\/settlement\/([\w-]+)$/);
    if (statusMatch) {
      const flowId = statusMatch[1];
      const flow = flows.get(flowId);
      if (!flow) {
        return sendJson(res, 404, { error: `No flow found for id ${flowId}` });
      }
      return sendJson(res, 200, flow);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Corda flow simulator listening on port ${PORT}`);
    console.log('This is a simulator standing in for a real CorDapp webserver plugin.');
    console.log('See docs/ARCHITECTURE.md for the production mapping.');
  });
}

module.exports = { server };
