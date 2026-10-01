// Crea la organización SBASE, un admin y un usuario cliente. Es idempotente:
// si un usuario ya existe, no lo toca.
//
// Credenciales: SEED_ADMIN_USER / SEED_ADMIN_PASSWORD y SEED_CLIENT_USER / SEED_CLIENT_PASSWORD.
// Si falta una contraseña, se genera una al azar y se muestra una sola vez.
import crypto from 'node:crypto';
import { config } from './config.js';
import { openDb } from './db.js';
import { hashPassword } from './auth.js';

const db = openDb(config.dbPath);

db.prepare(`INSERT INTO organizations (slug, name) VALUES ('sbase', 'SBASE') ON CONFLICT (slug) DO NOTHING`).run();
const sbase = db.prepare(`SELECT id FROM organizations WHERE slug = 'sbase'`).get();

const seeds = [
  {
    username: process.env.SEED_ADMIN_USER || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD,
    name: 'Equipo Pandora',
    role: 'admin',
    orgId: null,
  },
  {
    username: process.env.SEED_CLIENT_USER || 'sbase',
    password: process.env.SEED_CLIENT_PASSWORD,
    name: 'SBASE',
    role: 'cliente',
    orgId: sbase.id,
  },
];

const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');
const insert = db.prepare('INSERT INTO users (username, name, password_hash, role, org_id) VALUES (?, ?, ?, ?, ?)');

for (const s of seeds) {
  if (exists.get(s.username)) {
    console.log(`= ${s.role.padEnd(7)} ${s.username} ya existe, no se modifica`);
    continue;
  }
  const password = s.password || crypto.randomBytes(12).toString('base64url');
  insert.run(s.username, s.name, await hashPassword(password), s.role, s.orgId);
  console.log(`+ ${s.role.padEnd(7)} ${s.username}` + (s.password ? '' : `  contraseña: ${password}`));
}

db.close();
