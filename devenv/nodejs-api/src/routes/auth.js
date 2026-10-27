const express = require('express');
const { login } = require('../middleware/auth');

const router = express.Router();

// POST /auth/login  { oktaToken }
router.post('/login', async (req, res, next) => {
  try {
    const result = await login(req.body.oktaToken);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
