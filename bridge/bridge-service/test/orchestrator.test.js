'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BridgeOrchestrator } = require('../src/index');
const { TRUST_DOMAIN_CATEGORIES } = require('../src/trustDomainPolicy');

/**
 * A minimal in-memory fake standing in for MultiChainClient, so the
 * orchestrator's logic can be exercised without a running MultiChain
 * node. It mimics only the two methods index.js actually calls.
 */
class FakeMultiChainClient {
  constructor(initialItems = []) {
    this._items = initialItems;
    this.publishedRecords = [];
  }

  async listStreamItems() {
    return this._items;
  }

  async publish(stream, keys, jsonData) {
    this.publishedRecords.push({ stream, keys, jsonData });
    return 'fake-txid';
  }
}

function streamItem(record) {
  return { data: { json: record } };
}

function pendingEthereumRecord(ref = 'mr-bridge-2027-0000221190') {
  return {
    record_type: 'bridge_transaction',
    transaction_ref: ref,
    employee_ref: 'emp-ps-9a12f6c3',
    workflow_id: 'WF-11',
    bridge_status: 'pending_counterparty_confirmation',
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.UNGOVERNED,
      ledger: 'ethereum-sepolia',
      counterparty_ref: '0x0000000000000000000000000000000000dEaD',
    },
    conversion: { points_to_usd_rate: 0.01, usd_value: 2500 },
  };
}

function pendingMisclassifiedRecord() {
  return {
    record_type: 'bridge_transaction',
    transaction_ref: 'mr-bridge-2027-BAD0001',
    employee_ref: 'emp-ps-badcase01',
    workflow_id: 'WF-11',
    bridge_status: 'pending_counterparty_confirmation',
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.WHOLLY_GOVERNED, // wrong on purpose
      ledger: 'meridian-bank-consortium-corda',
      counterparty_ref: 'consortium-member-ref-001',
    },
    conversion: { points_to_usd_rate: 0.01, usd_value: 500 },
  };
}

test('orchestrator routes a valid Ethereum record to the Ethereum handler and writes back confirmation', async () => {
  const record = pendingEthereumRecord();
  const multichain = new FakeMultiChainClient([streamItem(record)]);

  const fakeEthereumBridge = {
    executeMint: async (r) => {
      assert.equal(r.transaction_ref, record.transaction_ref);
      return {
        bridge_status: 'counterparty_confirmed',
        counterparty_confirmation: { network: 'ethereum-sepolia', tx_hash: '0xFAKE' },
      };
    },
  };

  const orchestrator = new BridgeOrchestrator({
    multichain,
    ethereumBridge: fakeEthereumBridge,
    cordaBridge: { executeSettlement: async () => { throw new Error('should not be called'); } },
  });

  await orchestrator.pollOnce();

  assert.equal(multichain.publishedRecords.length, 1);
  const writeBack = multichain.publishedRecords[0].jsonData;
  assert.equal(writeBack.bridge_status, 'counterparty_confirmed');
  assert.equal(writeBack.transaction_ref, record.transaction_ref);
  assert.equal(writeBack.counterparty_confirmation.tx_hash, '0xFAKE');
});

test('orchestrator rejects a misclassified record without calling any bridge handler', async () => {
  const record = pendingMisclassifiedRecord();
  const multichain = new FakeMultiChainClient([streamItem(record)]);

  const orchestrator = new BridgeOrchestrator({
    multichain,
    ethereumBridge: { executeMint: async () => { throw new Error('should not be called'); } },
    cordaBridge: { executeSettlement: async () => { throw new Error('should not be called'); } },
  });

  await orchestrator.pollOnce();

  assert.equal(multichain.publishedRecords.length, 1);
  const writeBack = multichain.publishedRecords[0].jsonData;
  assert.equal(writeBack.bridge_status, 'rejected_trust_domain_mismatch');
  assert.match(writeBack.rejection_reason, /registry classifies that ledger as/);
});

test('orchestrator writes back counterparty_failed status when the handler throws', async () => {
  const record = pendingEthereumRecord('mr-bridge-2027-FAIL0001');
  const multichain = new FakeMultiChainClient([streamItem(record)]);

  const orchestrator = new BridgeOrchestrator({
    multichain,
    ethereumBridge: {
      executeMint: async () => {
        throw new Error('simulated gas spike beyond configured threshold');
      },
    },
    cordaBridge: { executeSettlement: async () => { throw new Error('should not be called'); } },
  });

  await orchestrator.pollOnce();

  const writeBack = multichain.publishedRecords[0].jsonData;
  assert.equal(writeBack.bridge_status, 'counterparty_failed');
  assert.match(writeBack.failure_reason, /simulated gas spike/);
});

test('orchestrator does not reprocess a transaction_ref it has already handled', async () => {
  const record = pendingEthereumRecord('mr-bridge-2027-DEDUPE01');
  const multichain = new FakeMultiChainClient([streamItem(record), streamItem(record)]);

  let callCount = 0;
  const orchestrator = new BridgeOrchestrator({
    multichain,
    ethereumBridge: {
      executeMint: async () => {
        callCount += 1;
        return { bridge_status: 'counterparty_confirmed', counterparty_confirmation: {} };
      },
    },
    cordaBridge: { executeSettlement: async () => { throw new Error('should not be called'); } },
  });

  await orchestrator.pollOnce();

  assert.equal(callCount, 1, 'handler should only be invoked once per transaction_ref');
  assert.equal(multichain.publishedRecords.length, 1);
});
