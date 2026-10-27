const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const correctionService = require('../services/correctionService');

const router = express.Router();

// POST /corrections - first administrator prepares (WF-7 step 3)
router.post('/', requireAuth, requireRole('administrator'), async (req, res, next) => {
  try {
    const { employeeId, pointsDelta, reason } = req.body;
    const result = correctionService.prepareCorrection({
      preparingAdminId: req.user.userId,
      employeeId,
      pointsDelta,
      reason
    });
    res.status(202).json(result);
  } catch (e) {
    next(e);
  }
});

// POST /corrections/:correctionId/approve - second, different
// administrator approves (WF-7 step 4, FR-9)
router.post('/:correctionId/approve', requireAuth, requireRole('administrator'), async (req, res, next) => {
  try {
    const result = await correctionService.approveCorrection({
      correctionId: req.params.correctionId,
      approvingAdminId: req.user.userId
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
