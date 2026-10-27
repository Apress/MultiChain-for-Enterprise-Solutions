// MultiChain has no on-chain virtual machine, so there is no smart
// contract to deploy. The business rules that a smart contract would
// enforce on Ethereum, the discretionary budget cap, the "cannot
// award yourself" rule, the automated-award eligibility check, are
// instead enforced HERE, in a trusted service that is the only
// component holding a chain address with write permission on
// award-events (see bootstrap-streams.sh). This is the pattern the
// chapter calls "logic-layer enforcement" as opposed to
// "protocol-layer enforcement": the guarantee comes from controlling
// who can publish, not from code executing on every node.

const { v4: uuidv4 } = require('uuid');
const multichain = require('../multichain/client');
const workday = require('../integrations/workdayClient');

const STREAM = 'award-events';

// In-memory budget ledger for the dev/demo environment only. A
// production build (Section 7.8) reads and updates this from the
// off-chain operational database described in Chapter 6, not memory.
const managerBudgets = new Map();

function remainingBudget(managerId, monthlyAllowance = 5000) {
  const spent = managerBudgets.get(managerId) || 0;
  return monthlyAllowance - spent;
}

// Workflow WF-3: Manager Discretionary Award
async function issueManagerAward({ managerId, employeeId, reasonCode, points }) {
  if (managerId === employeeId) {
    throw new BusinessRuleViolation('A manager cannot award their own account (FR-4).');
  }

  const remaining = remainingBudget(managerId);
  if (points > remaining) {
    throw new BusinessRuleViolation(
      `Award of ${points} exceeds remaining discretionary budget of ${remaining} (FR-3).`
    );
  }

  const transactionId = uuidv4();
  const payload = {
    transactionId,
    workflow: 'WF-3',
    type: 'manager-discretionary-award',
    managerId,
    employeeId,
    reasonCode,
    points,
    issuedAt: new Date().toISOString()
  };

  await multichain.publish(STREAM, employeeId, payload);

  managerBudgets.set(managerId, (managerBudgets.get(managerId) || 0) + points);

  return payload;
}

// Workflow WF-2: Automated Recognition Award (HRIS-triggered)
// In production this is invoked by a scheduled job reading Workday's
// event feed. In the dev environment it is invoked on demand against
// WireMock so the flow can be exercised without a live HRIS.
async function processAutomatedAwards() {
  const events = await workday.getQualifyingLifecycleEvents();
  const results = [];

  for (const event of events) {
    const employeeStatus = await workday.getEmployeeStatus(event.employeeId);

    if (employeeStatus !== 'active') {
      results.push({ employeeId: event.employeeId, status: 'queued-for-review', reason: 'inactive-in-workday' });
      continue;
    }

    const points = awardRuleTable(event.eventType);
    const transactionId = uuidv4();
    const payload = {
      transactionId,
      workflow: 'WF-2',
      type: 'automated-award',
      employeeId: event.employeeId,
      triggeringWorkdayEventId: event.workdayEventId,
      eventType: event.eventType,
      points,
      issuedAt: new Date().toISOString()
    };

    await multichain.publish(STREAM, event.employeeId, payload);
    results.push({ employeeId: event.employeeId, status: 'issued', points });
  }

  return results;
}

function awardRuleTable(eventType) {
  const table = {
    'service-anniversary-5yr': 500,
    'service-anniversary-10yr': 1000,
    'compliance-training-completed': 50,
    'professional-certification': 250
  };
  return table[eventType] || 0;
}

async function getEmployeeAwardHistory(employeeId) {
  return multichain.listStreamKeyItems(STREAM, employeeId);
}

class BusinessRuleViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusinessRuleViolation';
    this.statusCode = 422;
  }
}

module.exports = {
  issueManagerAward,
  processAutomatedAwards,
  getEmployeeAwardHistory,
  BusinessRuleViolation
};
