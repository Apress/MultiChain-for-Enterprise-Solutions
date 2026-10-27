const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const awardService = require('../services/awardService');

const router = express.Router();

// POST /awards/manager  - Workflow WF-3, manager-only
router.post('/manager', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { employeeId, reasonCode, points } = req.body;
    const result = await awardService.issueManagerAward({
      managerId: req.user.userId,
      employeeId,
      reasonCode,
      points
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

// POST /awards/automated/run - Workflow WF-2, administrator-triggered
// in the dev environment (production runs this on a schedule, Section 7.8)
router.post('/automated/run', requireAuth, requireRole('administrator'), async (req, res, next) => {
  try {
    const results = await awardService.processAutomatedAwards();
    res.json({ processed: results.length, results });
  } catch (e) {
    next(e);
  }
});

// GET /awards/:employeeId/history - FR-11 self-service, FR-12 audit
router.get('/:employeeId/history', requireAuth, async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const isSelf = req.user.userId === employeeId;
    const isPrivileged = ['administrator', 'auditor'].includes(req.user.role);

    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ error: 'Cannot view another employee\'s history.' });
    }

    const history = await awardService.getEmployeeAwardHistory(employeeId);
    res.json(history);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
