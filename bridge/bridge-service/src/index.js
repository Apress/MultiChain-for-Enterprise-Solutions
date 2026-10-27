'use strict';

/**
 * index.js
 *
 * The bridge service's main loop. This is the concrete implementation
 * of the process described in prose in Section 10.4 ("Where the
 * Bridge Actually Lives"): an application-layer service that watches
 * the relevant MultiChain stream for confirmed debit or lock
 * transactions, and, once confirmation depth is adequate, executes
 * the corresponding action on the counterparty ledger.
 *
 * Flow, matching Section 10.5's six numbered steps and Section 10.6's
 * equivalent:
 *
 *   1-3. (Handled upstream, in the Chapter 7 application layer, not
 *        in this file.) Employee initiates redemption; points are
 *        locked and then debited to a reserve address; the debit is
 *        recorded on the interoperability stream per Listing 10.1
 *        with bridge_status "pending_counterparty_confirmation".
 *
 *   4-5. (This file.) The bridge service polls the interoperability
 *        stream, finds pending records, validates each one against
 *        Table 10.1's registry (trustDomainPolicy.js), routes it to
 *        the correct handler by trust_domain_category, and executes
 *        the counterparty-side action.
 *
 *   6.   (This file.) The result, success or failure, is written back
 *        to the interoperability stream, cross-referenced to the
 *        original transaction_ref.
 *
 * This file intentionally does not implement steps 1-3; those belong
 * to the regional application/API layer described in Section 5.3 and
 * built out in Chapter 7, which this repository is designed to sit
 * alongside, not duplicate.
 */

const { MultiChainClient } = require('./multichainClient');
const { validateBridgeTransaction, TrustDomainViolationError } = require('./trustDomainPolicy');
const { EthereumBridge } = require('./ethereumBridge');
const { CordaBridge } = require('./cordaBridge');
const { FixedIntervalConversionRateProvider } = require('./conversionRateProvider');

const INTEROP_STREAM = 'interop-bridge-global-v1';
const POLL_INTERVAL_MS = Number(process.env.BRIDGE_POLL_INTERVAL_MS || 5000);

function buildMultiChainClient() {
  return new MultiChainClient({
    host: process.env.MULTICHAIN_RPC_HOST || 'localhost',
    port: Number(process.env.MULTICHAIN_RPC_PORT || 8570),
    rpcUser: process.env.MULTICHAIN_RPC_USER || 'meridian',
    rpcPassword: process.env.MULTICHAIN_RPC_PASSWORD || 'devpassword',
    chainName: process.env.MULTICHAIN_CHAIN_NAME || 'meridian-rewards-dev',
  });
}

function buildEthereumBridge() {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545');
  const treasurySigner = new ethers.Wallet(requireEnv('ETHEREUM_TREASURY_PRIVATE_KEY'), provider);
  const rateProvider = new FixedIntervalConversionRateProvider(
    Number(process.env.INITIAL_USD_PER_ETH_RATE || 3200)
  );
  return new EthereumBridge(
    provider,
    treasurySigner,
    requireEnv('ETHEREUM_NFT_CONTRACT_ADDRESS'),
    rateProvider
  );
}

function buildCordaBridge() {
  return new CordaBridge({
    facadeHost: process.env.CORDA_FACADE_HOST || 'localhost',
    facadePort: Number(process.env.CORDA_FACADE_PORT || 9200),
    participantBankId: process.env.MERIDIAN_CONSORTIUM_PARTICIPANT_ID || 'meridian-retail-banking-01',
  });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

class BridgeOrchestrator {
  constructor({ multichain, ethereumBridge, cordaBridge }) {
    this.multichain = multichain;
    this.ethereumBridge = ethereumBridge;
    this.cordaBridge = cordaBridge;
    this._seenTransactionRefs = new Set();
  }

  /**
   * One polling cycle: fetch recent interoperability stream items,
   * find any still pending counterparty confirmation, and process
   * each exactly once.
   */
  async pollOnce() {
    const items = await this.multichain.listStreamItems(INTEROP_STREAM, 50);

    for (const item of items) {
      const record = item?.data?.json;
      if (!record || record.record_type !== 'bridge_transaction') continue;
      if (record.bridge_status !== 'pending_counterparty_confirmation') continue;
      if (this._seenTransactionRefs.has(record.transaction_ref)) continue;

      this._seenTransactionRefs.add(record.transaction_ref);
      await this._processRecord(record);
    }
  }

  async _processRecord(record) {
    const { transaction_ref: transactionRef, employee_ref: employeeRef } = record;

    let registryEntry;
    try {
      registryEntry = validateBridgeTransaction(record);
    } catch (err) {
      if (err instanceof TrustDomainViolationError) {
        console.error(`[REJECTED] ${transactionRef}: ${err.message}`);
        await this._writeBack(record, {
          bridge_status: 'rejected_trust_domain_mismatch',
          rejection_reason: err.message,
        });
        return;
      }
      throw err;
    }

    console.log(
      `[PROCESSING] ${transactionRef} (employee ${employeeRef}) via handler "${registryEntry.handler}"`
    );

    try {
      let result;
      if (registryEntry.handler === 'ethereum') {
        result = await this.ethereumBridge.executeMint(record);
      } else if (registryEntry.handler === 'corda') {
        result = await this.cordaBridge.executeSettlement(record);
      } else {
        throw new Error(
          `No bridge handler implemented for registry handler "${registryEntry.handler}". ` +
            'Section 10.7\'s wholly-governed case does not require a bridge handler at all; ' +
            'see docs/ARCHITECTURE.md.'
        );
      }

      console.log(`[CONFIRMED] ${transactionRef}`);
      await this._writeBack(record, result);
    } catch (err) {
      console.error(`[FAILED] ${transactionRef}: ${err.message}`);
      await this._writeBack(record, {
        bridge_status: 'counterparty_failed',
        failure_reason: err.message,
      });
      // The application layer (Chapter 7) is responsible for observing
      // counterparty_failed status and releasing the associated point
      // lock, per WF-5's established timeout-and-release discipline.
      // This service's job ends at reporting the failure accurately.
    }
  }

  async _writeBack(originalRecord, resultFields) {
    const writeBackRecord = {
      record_type: 'bridge_transaction_result',
      schema_version: '1.0',
      transaction_ref: originalRecord.transaction_ref,
      employee_ref: originalRecord.employee_ref,
      workflow_id: originalRecord.workflow_id,
      occurred_at: new Date().toISOString(),
      recorded_by: 'bridge-service',
      ...resultFields,
    };

    await this.multichain.publish(
      INTEROP_STREAM,
      [originalRecord.transaction_ref, originalRecord.employee_ref],
      writeBackRecord
    );
  }

  async runForever() {
    console.log(`Bridge service starting. Polling ${INTEROP_STREAM} every ${POLL_INTERVAL_MS}ms.`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.pollOnce();
      } catch (err) {
        console.error('[POLL ERROR]', err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

if (require.main === module) {
  const orchestrator = new BridgeOrchestrator({
    multichain: buildMultiChainClient(),
    ethereumBridge: buildEthereumBridge(),
    cordaBridge: buildCordaBridge(),
  });
  orchestrator.runForever();
}

module.exports = { BridgeOrchestrator, buildMultiChainClient, buildEthereumBridge, buildCordaBridge };
