// Reconstructs an employee's current balance from the immutable
// award, redemption, and correction streams. In production this
// reducer runs behind a cache (Section 7.8) so balance queries meet
// the p95 < 800ms target from Table 4.6; the dev environment recomputes
// on every call for clarity.

const multichain = require('../multichain/client');

async function getBalance(employeeId) {
  const [awards, redemptions, corrections] = await Promise.all([
    multichain.listStreamKeyItems('award-events', employeeId),
    multichain.listStreamKeyItems('redemption-events', employeeId),
    multichain.listStreamKeyItems('correction-events', employeeId)
  ]);

  let balance = 0;

  for (const item of awards) {
    balance += item.data?.json?.points || 0;
  }

  for (const item of redemptions) {
    const data = item.data?.json;
    if (data?.type === 'redemption-confirmed') balance -= data.points || 0;
  }

  for (const item of corrections) {
    balance += item.data?.json?.pointsDelta || 0;
  }

  return balance;
}

module.exports = { getBalance };
