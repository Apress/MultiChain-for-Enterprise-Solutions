const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { redeemGiftCard } = require('../services/redemptionService');
const { getBalance } = require('../services/balanceService');

const router = express.Router();

// POST /redemptions/giftcard - Workflow WF-5
router.post('/giftcard', requireAuth, requireRole('employee'), async (req, res, next) => {
  try {
    const { sku, quantity } = req.body;
    const result = await redeemGiftCard({ employeeId: req.user.userId, sku, quantity });
    res.status(result.status === 'confirmed' ? 201 : 200).json(result);
  } catch (e) {
    next(e);
  }
});

// GET /redemptions/balance - FR-11, backed by the asset-equivalent
// balance reducer described in balanceService.js
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const balance = await getBalance(req.user.userId);
    res.json({ employeeId: req.user.userId, balance });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
