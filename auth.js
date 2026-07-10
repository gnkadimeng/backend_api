// Authentication & authorization for the CHIETA API.
// - JWT bearer tokens issued at /login
// - bcrypt password verification with transparent upgrade of legacy plaintext
// - requireAuth middleware: authenticates every non-public route AND enforces
//   object-level ownership on email-keyed resources (closes the IDOR gap).
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.SECRET_KEY;
const TOKEN_TTL = process.env.TOKEN_TTL || '12h';

function signToken(user) {
  return jwt.sign(
    { email: user.email, accounttype: user.accounttype },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

// Verify a candidate against the stored value. Supports bcrypt hashes and
// legacy plaintext (so existing rows keep working); `needsUpgrade` tells the
// caller to transparently re-hash a plaintext password after a good login.
async function verifyPassword(candidate, stored) {
  if (typeof stored === 'string' && /^\$2[aby]\$/.test(stored)) {
    return { ok: await bcrypt.compare(candidate, stored), needsUpgrade: false };
  }
  const ok = candidate === stored;
  return { ok, needsUpgrade: ok };
}

// Routes that never require a token.
function isPublic(p) {
  return (
    p === '/' ||
    p === '/health' ||
    p === '/uploads-check' ||
    p === '/login' ||
    p === '/openapi.json' ||
    p.startsWith('/api-docs') ||
    p.startsWith('/uploads')
  );
}

function requireAuth(req, res, next) {
  if (isPublic(req.path)) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = payload;

  // Object-level authorization: if the path targets a specific email, it must
  // be the caller's own — unless they are an Administrator. (@ may be url-encoded.)
  const m = req.path.match(/\/([^/]+(?:@|%40)[^/]+?)(?:\/|$)/);
  if (m && payload.accounttype !== 'Administrator') {
    const target = decodeURIComponent(m[1]).toLowerCase();
    if (target !== String(payload.email).toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden: you may only access your own data' });
    }
  }
  next();
}

module.exports = { signToken, hashPassword, verifyPassword, requireAuth, isPublic };
