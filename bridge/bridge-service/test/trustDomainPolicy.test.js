'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBridgeTransaction,
  TrustDomainViolationError,
  TRUST_DOMAIN_CATEGORIES,
} = require('../src/trustDomainPolicy');

function makeRecord(overrides = {}) {
  return {
    record_type: 'bridge_transaction',
    schema_version: '1.0',
    transaction_ref: 'mr-bridge-test-0001',
    employee_ref: 'emp-ps-test0001',
    workflow_id: 'WF-11',
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.UNGOVERNED,
      ledger: 'ethereum-sepolia',
      counterparty_ref: '0x0000000000000000000000000000000000dEaD',
    },
    conversion: { points_to_usd_rate: 0.01, usd_value: 100 },
    ...overrides,
  };
}

test('accepts a correctly classified ungoverned (public chain) record', () => {
  const record = makeRecord();
  const entry = validateBridgeTransaction(record);
  assert.equal(entry.category, TRUST_DOMAIN_CATEGORIES.UNGOVERNED);
  assert.equal(entry.handler, 'ethereum');
});

test('accepts a correctly classified consortium-participated record', () => {
  const record = makeRecord({
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.CONSORTIUM_PARTICIPATED,
      ledger: 'meridian-bank-consortium-corda',
      counterparty_ref: 'consortium-member-ref-001',
    },
  });
  const entry = validateBridgeTransaction(record);
  assert.equal(entry.category, TRUST_DOMAIN_CATEGORIES.CONSORTIUM_PARTICIPATED);
  assert.equal(entry.handler, 'corda');
});

test('accepts a correctly classified wholly-governed record', () => {
  const record = makeRecord({
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.WHOLLY_GOVERNED,
      ledger: 'meridian-internal-settlement',
      counterparty_ref: 'internal-account-ref-001',
    },
  });
  const entry = validateBridgeTransaction(record);
  assert.equal(entry.category, TRUST_DOMAIN_CATEGORIES.WHOLLY_GOVERNED);
});

test('rejects a record that misclassifies a consortium ledger as wholly governed', () => {
  // This is the exact mistake Section 10.2's Caution box warns against:
  // treating a familiar-looking ledger name as internal infrastructure
  // without checking governance.
  const record = makeRecord({
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.WHOLLY_GOVERNED, // wrong on purpose
      ledger: 'meridian-bank-consortium-corda',
      counterparty_ref: 'consortium-member-ref-001',
    },
  });

  assert.throws(() => validateBridgeTransaction(record), TrustDomainViolationError);
});

test('rejects a record referencing an unregistered ledger', () => {
  const record = makeRecord({
    counterparty: {
      trust_domain_category: TRUST_DOMAIN_CATEGORIES.UNGOVERNED,
      ledger: 'some-unregistered-chain',
      counterparty_ref: '0xdead',
    },
  });

  assert.throws(() => validateBridgeTransaction(record), TrustDomainViolationError);
});

test('rejects a record missing a counterparty block entirely', () => {
  const record = makeRecord({ counterparty: undefined });
  assert.throws(() => validateBridgeTransaction(record), TrustDomainViolationError);
});
