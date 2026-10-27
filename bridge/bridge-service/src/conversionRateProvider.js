'use strict';

/**
 * conversionRateProvider.js
 *
 * Implements the rate-source decision from Table 10.2. That table
 * presented two real options rather than picking one silently:
 *
 *   - A live price feed at transaction time (accurate, but a new
 *     integration touchpoint not present in Table 4.8, with a new
 *     failure mode if the feed is stale or unreachable)
 *   - A periodically fixed rate (simpler, auditable, but exposes
 *     Meridian or the employee to slippage between when the rate is
 *     fixed and when the bridge service actually executes)
 *
 * This module implements the periodically-fixed-rate option, because
 * it is the option that does not require this repository to depend on
 * a live, keyed, third-party price API just to be runnable. A
 * production deployment that instead chooses the live-feed option
 * should replace getUsdToEthRate()'s implementation without touching
 * any calling code in ethereumBridge.js, exactly the seam Table 10.2
 * anticipated by assigning this decision to a named owner rather than
 * leaving it implicit in the bridge code.
 *
 * Every rate this provider returns is logged with a rate_ref, so the
 * slippage question from Table 10.2 ("who absorbs slippage") can
 * actually be answered later by comparing the locked rate_ref against
 * the rate in effect at execution time, per the reconciliation cycle
 * WF-10 already established.
 */

const crypto = require('crypto');

class FixedIntervalConversionRateProvider {
  /**
   * @param {number} initialRateUsdPerEth - starting rate, USD per 1 ETH
   * @param {number} [refreshIntervalMs] - how often the fixed rate is
   *   allowed to update; in production this would be driven by a
   *   scheduled Finance-owned process, per Table 10.2's assignment of
   *   this decision to the Head of Architecture and Innovation,
   *   consulted with Finance.
   */
  constructor(initialRateUsdPerEth, refreshIntervalMs = 24 * 60 * 60 * 1000) {
    this.currentRate = initialRateUsdPerEth;
    this.refreshIntervalMs = refreshIntervalMs;
    this.lastSetAt = Date.now();
  }

  /**
   * In production, an operational job calls this on the configured
   * interval, sourced from Finance-approved treasury policy, not from
   * this bridge service deciding its own exchange rate.
   */
  setRate(newRateUsdPerEth) {
    this.currentRate = newRateUsdPerEth;
    this.lastSetAt = Date.now();
  }

  async getUsdToEthRate() {
    const rateRef = crypto
      .createHash('sha256')
      .update(`rate:${this.currentRate}:${this.lastSetAt}`)
      .digest('hex')
      .slice(0, 16);

    return {
      rate: this.currentRate,
      rateRef: `rate-lock-${rateRef}`,
      setAt: this.lastSetAt,
    };
  }
}

module.exports = { FixedIntervalConversionRateProvider };
