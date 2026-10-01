import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

const PASS = 'clave-de-prueba';

async function startServer({ loginLimit = 1000 } = {}) {
  const db = openDb(':memory:');
  db.exec(`INSERT INTO organizations (slug, name) VALUES ('sbase', 'SBASE'), ('otra', 'Otra organización')`);
  const hash = await hashPassword(PASS, 4);
  const add = db.prepare('INSERT INTO users (username, name, password_hash, role, org_id, active) VALUES (?, ?, ?, ?, ?, ?)');
  add.run('admin', 'Equipo Pandora', hash, 'admin', null, 1);
  add.run('sbase', 'SBASE', hash, 'cliente', 1, 1);
  add.run('baja', 'Usuario dado de baja', hash, 'cliente', 1, 0);

  const app = createApp({
    db,
    config: { isProd: false, secureCookie: false, sessionHours: 8, loginLimit, trustProxy: 0, publicSiteDir: fileURLToPath(new URL('../../pandora-opcion-a', import.meta.url)) },
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://localhost:${server.address().port}`;

  // fetch sin seguir redirecciones; cookie opcional
  const req = (path, { cookie, ...opts } = {}) =>
    fetch(base + path, { redirect: 'manual', ...opts, headers: { ...(cookie && { cookie }), ...opts.headers } });

  const login = (body, headers = {}) =>
    req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  // Devuelve "pandora_sid=..." listo para mandar como header Cookie
  const loginAs = async (username, role = 'cliente') => {
    const res = await login({ username, password: PASS, role });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  };

  return { db, server, base, req, login, loginAs };
}

describe('login y roles', () => {
  let t;
  before(async () => { t = await startServer(); });
  after(() => t.server.close());

  test('sin sesión, las páginas privadas redirigen al login con next', async () => {
    for (const path of ['/admin/', '/clientes/sbase/', '/clientes/sbase/actualizaciones/1']) {
      const res = await t.req(path);
      assert.equal(res.status, 302, path);
      assert.equal(res.headers.get('location'), '/clientes/?next=' + encodeURIComponent(path));
    }
  });

  test('sin sesión, la API responde 401', async () => {
    const res = await t.req('/api/me');
    assert.equal(res.status, 401);
  });

  test('el login y los estáticos del portal son públicos', async () => {
    assert.equal((await t.req('/clientes/')).status, 200);
    assert.equal((await t.req('/portal-assets/css/portal.css')).status, 200);
  });

  test('campos vacíos → 400 con el mensaje del diseño', async () => {
    const res = await t.login({ username: ' ', password: '' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Completá usuario y contraseña para ingresar.');
  });

  test('contraseña incorrecta y usuario inexistente dan el mismo error', async () => {
    const a = await t.login({ username: 'sbase', password: 'mal' });
    const b = await t.login({ username: 'nadie', password: 'mal' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(await a.json(), await b.json());
    assert.equal(a.headers.get('set-cookie'), null);
  });

  test('un usuario dado de baja no puede ingresar', async () => {
    const res = await t.login({ username: 'baja', password: PASS });
    assert.equal(res.status, 401);
  });

  test('cliente: entra a su portal, con cookie httpOnly', async () => {
    const res = await t.login({ username: 'SBASE', password: PASS, role: 'cliente' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.redirect, '/clientes/sbase/');
    assert.equal(body.user.role, 'cliente');
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
  });

  test('cliente: ve su organización, no ve /admin ni otra organización', async () => {
    const cookie = await t.loginAs('sbase');
    assert.equal((await t.req('/clientes/sbase/', { cookie })).status, 200);
    assert.equal((await t.req('/clientes/sbase/actualizaciones/1', { cookie })).status, 200);
    assert.equal((await t.req('/admin/', { cookie })).status, 403);
    assert.equal((await t.req('/admin/usuarios', { cookie })).status, 403);
    assert.equal((await t.req('/clientes/otra/', { cookie })).status, 404);
    assert.equal((await t.req('/clientes/no-existe/', { cookie })).status, 404);
  });

  test('cliente con el selector en "Administrador" → 403 y sin sesión', async () => {
    const res = await t.login({ username: 'sbase', password: PASS, role: 'admin' });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  test('admin: va al CMS y también puede ver el portal del cliente', async () => {
    const res = await t.login({ username: 'admin', password: PASS, role: 'admin' });
    assert.equal((await res.json()).redirect, '/admin/');
    const cookie = res.headers.get('set-cookie').split(';')[0];
    assert.equal((await t.req('/admin/', { cookie })).status, 200);
    assert.equal((await t.req('/clientes/sbase/', { cookie })).status, 200);
    assert.equal((await t.req('/clientes/otra/', { cookie })).status, 200);
    assert.equal((await t.req('/clientes/no-existe/', { cookie })).status, 404);
  });

  test('admin con el selector en "Cliente" va a la vista del cliente', async () => {
    const res = await t.login({ username: 'admin', password: PASS, role: 'cliente' });
    assert.equal((await res.json()).redirect, '/clientes/sbase/');
  });

  test('next: se respeta si es una ruta permitida y se descarta si no', async () => {
    const dest = async (username, role, next) => (await (await t.login({ username, password: PASS, role, next })).json()).redirect;
    assert.equal(await dest('sbase', 'cliente', '/clientes/sbase/actualizaciones/3'), '/clientes/sbase/actualizaciones/3');
    assert.equal(await dest('sbase', 'cliente', '/admin/'), '/clientes/sbase/');
    assert.equal(await dest('sbase', 'cliente', '/clientes/otra/'), '/clientes/sbase/');
    assert.equal(await dest('sbase', 'cliente', '//evil.example/'), '/clientes/sbase/');
    assert.equal(await dest('sbase', 'cliente', '/\\evil.example/'), '/clientes/sbase/');
    assert.equal(await dest('sbase', 'cliente', 'https://evil.example/'), '/clientes/sbase/');
    assert.equal(await dest('admin', 'admin', '/admin/usuarios'), '/admin/usuarios');
  });

  test('/clientes/ con sesión redirige al espacio del usuario', async () => {
    const cookie = await t.loginAs('sbase');
    const res = await t.req('/clientes/', { cookie });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/clientes/sbase/');
  });

  test('/api/me devuelve el usuario y su organización', async () => {
    const cookie = await t.loginAs('sbase');
    const { user } = await (await t.req('/api/me', { cookie })).json();
    assert.deepEqual(user, { name: 'SBASE', username: 'sbase', role: 'cliente', org: { slug: 'sbase', name: 'SBASE' } });
  });

  test('logout invalida la sesión en el servidor', async () => {
    const cookie = await t.loginAs('sbase');
    const out = await t.req('/api/auth/logout', { method: 'POST', cookie });
    assert.equal(out.status, 204);
    // Aunque alguien conserve la cookie vieja, ya no sirve.
    assert.equal((await t.req('/api/me', { cookie })).status, 401);
    assert.equal((await t.req('/clientes/sbase/', { cookie })).status, 302);
  });

  test('una sesión vencida no sirve', async () => {
    const cookie = await t.loginAs('sbase');
    t.db.exec('UPDATE sessions SET expires_at = 0');
    assert.equal((await t.req('/api/me', { cookie })).status, 401);
  });

  test('dar de baja a un usuario corta sus sesiones activas', async () => {
    t.db.exec(`UPDATE users SET active = 1 WHERE username = 'baja'`);
    const res = await t.login({ username: 'baja', password: PASS });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    assert.equal((await t.req('/api/me', { cookie })).status, 200);
    t.db.exec(`UPDATE users SET active = 0 WHERE username = 'baja'`);
    assert.equal((await t.req('/api/me', { cookie })).status, 401);
  });

  test('POST desde otro origen → 403', async () => {
    const res = await t.login({ username: 'sbase', password: PASS }, { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
  });

  test('las páginas privadas y la API no se cachean', async () => {
    const cookie = await t.loginAs('sbase');
    assert.equal((await t.req('/clientes/sbase/', { cookie })).headers.get('cache-control'), 'no-store');
    assert.equal((await t.req('/api/me', { cookie })).headers.get('cache-control'), 'no-store');
  });

  test('el sitio público se sirve en / con el link "Acceso clientes"', async () => {
    const res = await t.req('/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /href="\/clientes\/"[^>]*>Acceso clientes</);
  });
});

describe('límite de intentos de login', () => {
  let t;
  before(async () => { t = await startServer({ loginLimit: 3 }); });
  after(() => t.server.close());

  test('después de N intentos fallidos responde 429', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await t.login({ username: 'sbase', password: 'mal' })).status, 401);
    const res = await t.login({ username: 'sbase', password: PASS });
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /Demasiados intentos/);
  });
});
