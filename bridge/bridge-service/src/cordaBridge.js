'use strict';

/**
 * cordaBridge.js
 *
 * Implements Section 10.6's worked example: an attested settlement
 * integration with a consortium-governed ledger, reconciled per
 * WF-10's vendor-settlement pattern rather than treated as an
 * internal audit extension, per the correction made explicitly in
 * that section.
 *
 * This module talks over HTTP to whatever implements the flow-trigger
 * REST contract, corda-flow-simulator/server.js for local development,
 * or a real CorDapp webserver plugin in production. Nothing in this
 * file needs to change when swapping one for the other, which is
 * exactly the point of putting that boundary behind a REST contract
 * in the first place.
 */

const http = require('http');

class CordaBridge {
  /**
   * @param {object} options
   * @param {string} options.facadeHost - host of the CorDapp webserver
   *   plugin (or its local simulator)
   * @param {number} options.facadePort
   * @param {string} options.participantBankId - the consortium-issued
   *   identifier for Meridian Retail Banking's own participant node,
   *   never Meridian's internal EmpID or employee identity, per
   *   Section 5.2's data minimization principle carried into this
   *   chapter.
   * @param {number} [options.pollIntervalMs=500]
   * @param {number} [options.pollTimeoutMs=30000]
   */
  constructor({ facadeHost, facadePort, participantBankId, pollIntervalMs = 500, pollTimeoutMs = 30000 }) {
    this.facadeHost = facadeHost;
    this.facadePort = facadePort;
    this.participantBankId = participantBankId;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const options = {
        host: this.facadeHost,
        port: this.facadePort,
        path,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      };
      const req = http.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: raw ? JSON.parse(raw) : {} });
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Initiates the authenticated CorDapp flow described in Section
   * 10.6, waits for the consortium notary to finalize it, and returns
   * a result shaped for write-back onto MultiChain's interoperability
   * stream, mirroring ethereumBridge.js's return contract so index.js
   * can treat both counterparty types uniformly at the call site.
   */
  async executeSettlement(bridgeTransaction) {
    const { transaction_ref: transactionRef, employee_ref: employeeRef, conversion } = bridgeTransaction;

    if (!conversion || typeof conversion.usd_value !== 'number') {
      throw new Error(
        `bridge_transaction ${transactionRef} is missing conversion.usd_value; ` +
          'cannot initiate Corda settlement flow without a resolved USD value.'
      );
    }

    const initiateResponse = await this._request('POST', '/flows/settlement', {
      transactionRef,
      employeeRef,
      usdValue: conversion.usd_value,
      participantBankId: this.participantBankId,
    });

    if (initiateResponse.statusCode !== 202) {
      throw new Error(
        `Corda flow-trigger facade rejected settlement initiation for ${transactionRef}: ` +
          JSON.stringify(initiateResponse.body)
      );
    }

    const { flowId } = initiateResponse.body;
    const finalized = await this._pollUntilNotarized(flowId, transactionRef);

    return {
      bridge_status: 'counterparty_confirmed',
      counterparty_confirmation: {
        network: bridgeTransaction.counterparty.ledger,
        corda_flow_id: finalized.flowId,
        settlement_ref: finalized.settlementRef,
        notary_signature: finalized.notarySignature,
        notarized_at: new Date(finalized.notarizedAt).toISOString(),
      },
    };
  }

  async _pollUntilNotarized(flowId, transactionRef) {
    const deadline = Date.now() + this.pollTimeoutMs;

    while (Date.now() < deadline) {
      const { statusCode, body } = await this._request('GET', `/flows/settlement/${flowId}`);
      if (statusCode === 200 && body.status === 'NOTARIZED') {
        return body;
      }
      if (statusCode !== 200) {
        throw new Error(`Failed to poll Corda flow ${flowId} for ${transactionRef}: ${JSON.stringify(body)}`);
      }
      await this._sleep(this.pollIntervalMs);
    }

    // No settlement occurred within the timeout. The caller (index.js)
    // is responsible for releasing the associated point lock, the same
    // timeout-and-release discipline WF-5 already established for
    // GiftFlex fulfillment failures.
    throw new Error(
      `Corda flow ${flowId} for transaction ${transactionRef} did not reach NOTARIZED ` +
        `status within ${this.pollTimeoutMs}ms.`
    );
  }
}

module.exports = { CordaBridge };
