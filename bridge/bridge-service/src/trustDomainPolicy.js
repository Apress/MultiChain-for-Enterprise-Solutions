'use strict';

/**
 * trustDomainPolicy.js
 *
 * Implements Table 10.1's three-row taxonomy as an enforced,
 * queryable policy rather than a design-time judgment call that
 * leaves no trace in the record itself.
 *
 * Every registered counterparty must be classified into exactly one
 * of the three categories below. A bridge_transaction record (Listing
 * 10.1) that declares a counterparty.trust_domain_category which does
 * not match the counterparty's registered classification is rejected
 * before any bridge action is attempted, per the validation rule
 * described in Section 10.4.
 */

const TRUST_DOMAIN_CATEGORIES = Object.freeze({
  WHOLLY_GOVERNED: 'wholly_governed',
  CONSORTIUM_PARTICIPATED: 'consortium_participated',
  UNGOVERNED: 'ungoverned',
});

/**
 * Registered counterparty ledgers, keyed by the same `ledger` string
 * used in Listing 10.1's counterparty block. In production this
 * registry would be change-controlled application configuration, not
 * a hardcoded object; it is kept explicit and readable here so the
 * mapping back to Table 10.1 is easy to inspect.
 */
const COUNTERPARTY_REGISTRY = {
  'ethereum-mainnet': {
    category: TRUST_DOMAIN_CATEGORIES.UNGOVERNED,
    description:
      'Public, permissionless network. No accountable governance body. ' +
      'Per Table 10.1, row 3: trust must be manufactured unilaterally via a custodial bridge.',
    handler: 'ethereum',
  },
  'ethereum-sepolia': {
    category: TRUST_DOMAIN_CATEGORIES.UNGOVERNED,
    description: 'Public testnet, used by this repository for local development only.',
    handler: 'ethereum',
  },
  'meridian-bank-consortium-corda': {
    category: TRUST_DOMAIN_CATEGORIES.CONSORTIUM_PARTICIPATED,
    description:
      'Multi-bank tokenized-deposit network. Meridian Retail Banking holds one ' +
      'participant seat; the consortium notary, not Meridian, is the finalizing ' +
      'authority. Per Table 10.1, row 2: reconciled as an attested settlement, ' +
      'following WF-10\'s vendor-settlement pattern, never as an internal audit extension.',
    handler: 'corda',
  },
  'meridian-internal-settlement': {
    category: TRUST_DOMAIN_CATEGORIES.WHOLLY_GOVERNED,
    description:
      'Ledger wholly operated and controlled by Meridian Group Technology and ' +
      'Operations, per Section 10.7\'s contrast case. Per Table 10.1, row 1: ' +
      'mutually authenticated settlement, no custodial trust manufactured.',
    handler: 'internal',
  },
};

class TrustDomainViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrustDomainViolationError';
  }
}

/**
 * Classifies a ledger identifier against the registry. Throws if the
 * ledger is not registered at all, since an unregistered counterparty
 * has not been through the Section 10.2 classification exercise and
 * must not be bridged to silently.
 */
function classify(ledgerId) {
  const entry = COUNTERPARTY_REGISTRY[ledgerId];
  if (!entry) {
    throw new TrustDomainViolationError(
      `Ledger "${ledgerId}" is not a registered counterparty. ` +
        'Per Section 10.2, every counterparty must be classified against ' +
        'Table 10.1 before any bridge transaction may reference it.'
    );
  }
  return entry;
}

/**
 * Validates a bridge_transaction record (Listing 10.1 shape) against
 * the registry before any bridge action is attempted. This is the
 * concrete implementation of the validation rule named in Section
 * 10.4: "an application-layer validation rule ... rejects any bridge
 * record whose declared category does not match the counterparty's
 * registered classification."
 */
function validateBridgeTransaction(record) {
  if (!record || !record.counterparty || !record.counterparty.ledger) {
    throw new TrustDomainViolationError(
      'bridge_transaction record is missing a counterparty.ledger field.'
    );
  }

  const { ledger, trust_domain_category: declaredCategory } = record.counterparty;
  const registryEntry = classify(ledger);

  if (declaredCategory !== registryEntry.category) {
    throw new TrustDomainViolationError(
      `bridge_transaction ${record.transaction_ref || '(unknown ref)'} declares ` +
        `trust_domain_category "${declaredCategory}" for ledger "${ledger}", but the ` +
        `registry classifies that ledger as "${registryEntry.category}". Record rejected ` +
        'without executing any counterparty action.'
    );
  }

  return registryEntry;
}

module.exports = {
  TRUST_DOMAIN_CATEGORIES,
  COUNTERPARTY_REGISTRY,
  TrustDomainViolationError,
  classify,
  validateBridgeTransaction,
};
