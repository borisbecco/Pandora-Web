import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { ROOT } from './config.js';
import { createAuth } from './auth.js';
import { isAdmin, canViewOrg, homeFor, safeNext } from './access.js';

const PAGES = path.join(ROOT, 'public', 'pages');
const ASSETS = path.join(ROOT, 'public', 'assets');

const MSG = {
  missing: 'Completá usuario y contraseña para ingresar.',
  invalid: 'Usuario o contraseña incorrectos.',
  notAdmin: 'Este usuario no tiene acceso de administrador.',
  limited: 'Demasiados intentos fallidos. Probá de nuevo en unos minutos.',
  badOrigin: 'Origen no permitido.',
  unauthenticated: 'Iniciá sesión para continuar.',
  badRequest: 'Solicitud inválida.',
  notFound: 'No encontrado.',
  internal: 'Ocurrió un error. Probá de nuevo.',
};

const sendPage = (res, name, status = 200) => res.status(status).sendFile(path.join(PAGES, name));

const publicUser = (u) => ({
  name: u.name,
  username: u.username,
  role: u.role,
  org: u.org_slug ? { slug: u.org_slug, name: u.org_name } : null,
});

// Nada privado debe quedar en cachés intermedias ni en el historial del navegador.
const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// Defensa CSRF complementaria a SameSite=Lax: si el navegador manda Origin, tiene que ser este sitio.
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== req.get('host')) return res.status(403).json({ error: MSG.badOrigin });
  }
  next();
}

export function createApp({ db, config }) {
  const app = express();
  const auth = createAuth(db, config);
  app.locals.auth = auth;

  const orgBySlug = db.prepare('SELECT id, slug, name FROM organizations WHERE slug = ?');
  const firstOrg = db.prepare('SELECT slug FROM organizations ORDER BY id LIMIT 1');

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // En local se sirve por http; en producción el navegador fuerza https.
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
      strictTransportSecurity: config.isProd,
    }),
  );
  app.use(cookieParser());
  app.use(auth.loadUser);

  // ---------- API ----------
  const api = express.Router();
  api.use(noStore, express.json({ limit: '100kb' }), sameOrigin);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: MSG.limited }),
  });

  // Destino después del login. El selector Cliente/Administrador elige a dónde
  // ir; el permiso real lo define el rol guardado en la base.
  const destinationFor = (user, requestedRole) => {
    if (isAdmin(user) && requestedRole === 'cliente') {
      const org = firstOrg.get();
      return org ? `/clientes/${org.slug}/` : '/admin/';
    }
    return homeFor(user);
  };

  api.post('/auth/login', loginLimiter, async (req, res) => {
    const { username, password, role, next } = req.body ?? {};
    const user_ = typeof username === 'string' ? username.trim() : '';
    const pass = typeof password === 'string' ? password : '';
    if (!user_ || !pass) return res.status(400).json({ error: MSG.missing });
    if (user_.length > 200 || pass.length > 200) return res.status(401).json({ error: MSG.invalid });

    const user = await auth.verifyCredentials(user_, pass);
    if (!user) return res.status(401).json({ error: MSG.invalid });
    if (role === 'admin' && !isAdmin(user)) return res.status(403).json({ error: MSG.notAdmin });

    auth.startSession(res, user.id);
    res.json({ user: publicUser(user), redirect: safeNext(next, user) ?? destinationFor(user, role) });
  });

  api.post('/auth/logout', (req, res) => {
    auth.endSession(req, res);
    res.status(204).end();
  });

  api.get('/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: MSG.unauthenticated });
    res.json({ user: publicUser(req.user) });
  });

  api.use((_req, res) => res.status(404).json({ error: MSG.notFound }));
  api.use((err, _req, res, _next) => {
    if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: MSG.badRequest });
    console.error(err);
    res.status(500).json({ error: MSG.internal });
  });

  app.use('/api', api);

  // ---------- Páginas ----------
  // Sin sesión, cualquier página privada manda al login y vuelve después.
  const requireSession = (req, res, next) => {
    if (!req.user) return res.redirect(`/clientes/?next=${encodeURIComponent(req.originalUrl)}`);
    next();
  };

  app.get('/clientes/', noStore, (req, res) => {
    if (req.user) return res.redirect(safeNext(req.query.next, req.user) ?? homeFor(req.user));
    sendPage(res, 'login.html');
  });

  app.use('/admin', noStore, requireSession, (req, res, next) => {
    if (!isAdmin(req.user)) return sendPage(res, '403.html', 403);
    next();
  });
  app.get('/admin{/*rest}', (_req, res) => sendPage(res, 'admin.html'));

  // 404 tanto si la organización no existe como si es de otro cliente:
  // así no se puede averiguar qué organizaciones hay.
  app.use('/clientes/:org', noStore, requireSession, (req, res, next) => {
    const org = canViewOrg(req.user, req.params.org) && orgBySlug.get(req.params.org);
    if (!org) return sendPage(res, '404.html', 404);
    req.org = org;
    next();
  });
  app.get('/clientes/:org{/*rest}', (_req, res) => sendPage(res, 'portal.html'));

  // ---------- Estáticos ----------
  app.use('/portal-assets', express.static(ASSETS, { maxAge: config.isProd ? '1h' : 0 }));
  app.use(express.static(config.publicSiteDir));

  app.use((_req, res) => sendPage(res, '404.html', 404));

  return app;
}
