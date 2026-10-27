// Workflow WF-5: Catalog Redemption, Digital Gift Card.
// Implements the point-lock-and-fulfil pattern from Chapter 6:
// points are locked on-chain before the vendor call, and released
// automatically if GiftFlex cannot fulfil within the timeout.

const { v4: uuidv4 } = require('uuid');
const multichain = require('../multichain/client');
const giftflex = require('../integrations/giftflexClient');
const { getBalance } = require('./balanceService');

const STREAM = 'redemption-events';
const FULFILMENT_TIMEOUT_MS = 8000;

async function redeemGiftCard({ employeeId, sku, quantity }) {
  const balance = await getBalance(employeeId);
  const cost = await giftflex.getSkuPointCost(sku);
  const totalCost = cost * quantity;

  if (balance < totalCost) {
    const err = new Error(`Insufficient balance: have ${balance}, need ${totalCost} (WF-5 step 2).`);
    err.statusCode = 422;
    throw err;
  }

  const lockId = uuidv4();

  // Step 3: lock points and cross Zone A -> Zone C with minimized data
  // (SKU, quantity, pseudonymous token only - no name, no history).
  await multichain.publish(STREAM, employeeId, {
    lockId,
    type: 'point-lock',
    employeeId,
    points: totalCost,
    lockedAt: new Date().toISOString()
  });

  const pseudonymousToken = uuidv4();

  try {
    const fulfilment = await Promise.race([
      giftflex.requestFulfilment({ sku, quantity, pseudonymousToken }),
      timeout(FULFILMENT_TIMEOUT_MS)
    ]);

    await multichain.publish(STREAM, employeeId, {
      lockId,
      type: 'redemption-confirmed',
      employeeId,
      sku,
      quantity,
      points: totalCost,
      redemptionCode: fulfilment.redemptionCode,
      confirmedAt: new Date().toISOString()
    });

    return { status: 'confirmed', redemptionCode: fulfilment.redemptionCode, pointsDeducted: totalCost };

  } catch (e) {
    // Step 5: release the lock automatically, no point loss.
    await multichain.publish(STREAM, employeeId, {
      lockId,
      type: 'point-lock-released',
      employeeId,
      reason: e.message,
      releasedAt: new Date().toISOString()
    });

    return { status: 'not-completed', reason: e.message, pointsDeducted: 0 };
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('giftflex-timeout')), ms));
}

module.exports = { redeemGiftCard };
