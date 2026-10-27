// Workflow WF-7: Dispute and Correction.
// Enforces FR-9 in the logic layer: a correction requires two
// DIFFERENT administrator identities before it is published, and it
// is always written as a new transaction, never an edit to history.

const { v4: uuidv4 } = require('uuid');
const multichain = require('../multichain/client');

const STREAM = 'correction-events';
const pendingCorrections = new Map(); // dev-only in-memory staging area

function prepareCorrection({ preparingAdminId, employeeId, pointsDelta, reason }) {
  const correctionId = uuidv4();
  pendingCorrections.set(correctionId, {
    correctionId,
    preparingAdminId,
    employeeId,
    pointsDelta,
    reason,
    status: 'awaiting-second-approval'
  });
  return { correctionId, status: 'awaiting-second-approval' };
}

async function approveCorrection({ correctionId, approvingAdminId }) {
  const draft = pendingCorrections.get(correctionId);
  if (!draft) {
    const err = new Error('No such pending correction.');
    err.statusCode = 404;
    throw err;
  }

  if (approvingAdminId === draft.preparingAdminId) {
    const err = new Error('Approving administrator must differ from the preparing administrator (FR-9).');
    err.statusCode = 422;
    throw err;
  }

  const payload = {
    correctionId: draft.correctionId,
    workflow: 'WF-7',
    type: 'balance-correction',
    employeeId: draft.employeeId,
    pointsDelta: draft.pointsDelta,
    reason: draft.reason,
    preparedBy: draft.preparingAdminId,
    approvedBy: approvingAdminId,
    appliedAt: new Date().toISOString()
  };

  await multichain.publish(STREAM, draft.employeeId, payload);
  pendingCorrections.delete(correctionId);

  return payload;
}

module.exports = { prepareCorrection, approveCorrection };
