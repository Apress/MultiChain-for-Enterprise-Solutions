// Establishes the caller's role for every request. The Streamlit UI's
// login screen (Section 7.6) calls POST /auth/login once with an Okta
// mock token; this module issues a short-lived JWT carrying the role
// claim, and every subsequent API call is authorized against it.
// This is the mechanism referenced in the chapter as "login at the UI
// establishes role."

const jwt = require('jsonwebtoken');
const okta = require('../integrations/oktaClient');

const SECRET = process.env.JWT_SIGNING_SECRET;
const VALID_ROLES = ['employee', 'manager', 'administrator', 'auditor'];

async function login(oktaToken) {
  const claims = await okta.introspectToken(oktaToken);

  if (!claims.active) {
    const err = new Error('Okta token is not active.');
    err.statusCode = 401;
    throw err;
  }

  const role = claims.groups.find((g) => VALID_ROLES.includes(g));
  if (!role) {
    const err = new Error('Okta token carries no recognized Meridian Rewards role.');
    err.statusCode = 403;
    throw err;
  }

  const sessionToken = jwt.sign(
    { userId: claims.userId, role, region: claims.region },
    SECRET,
    { expiresIn: '1h' }
  );

  return { sessionToken, userId: claims.userId, role, region: claims.region };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Missing bearer token.' });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${allowedRoles.join(', ')}` });
    }
    next();
  };
}

module.exports = { login, requireAuth, requireRole };
