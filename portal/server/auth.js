import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const COOKIE = 'pandora_sid';
export const BCRYPT_COST = 12;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Se compara contra este hash cuando el usuario no existe, para que la respuesta
// tarde lo mismo y no revele qué usuarios están dados de alta.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

export const hashPassword = (password, cost = BCRYPT_COST) => bcrypt.hash(password, cost);

export function createAuth(db, { sessionHours, secureCookie }) {
  const ttl = sessionHours * 60 * 60 * 1000;
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/' };

  const q = {
    userByName: db.prepare(`
      SELECT u.*, o.slug AS org_slug, o.name AS org_name
      FROM users u LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.username = ?`),
    sessionUser: db.prepare(`
      SELECT u.id, u.username, u.name, u.role, u.org_id, o.slug AS org_slug, o.name AS org_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN organizations o ON o.id = u.org_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    touchLogin: db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`),
  };

  // Devuelve el usuario si las credenciales son válidas y está activo; si no, null.
  async function verifyCredentials(username, password) {
    const user = q.userByName.get(username);
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    return ok && user?.active ? user : null;
  }

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    q.insertSession.run(sha256(token), userId, now, now + ttl);
    q.touchLogin.run(userId);
    res.cookie(COOKIE, token, { ...cookieOpts, maxAge: ttl });
  }

  function endSession(req, res) {
    const token = req.cookies?.[COOKIE];
    if (token) q.deleteSession.run(sha256(token));
    res.clearCookie(COOKIE, cookieOpts);
  }

  // Middleware: deja en req.user el usuario de la sesión, o null.
  function loadUser(req, _res, next) {
    const token = req.cookies?.[COOKIE];
    req.user = token ? q.sessionUser.get(sha256(token), Date.now()) ?? null : null;
    next();
  }

  const purgeExpired = () => q.purgeExpired.run(Date.now()).changes;

  return { verifyCredentials, startSession, endSession, loadUser, purgeExpired };
}
