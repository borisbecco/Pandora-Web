import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT) || 3000,
  isProd,
  dbPath: process.env.DATABASE_PATH || path.join(ROOT, 'data', 'pandora.db'),
  // Sitio público que se sirve en "/". Por ahora, la opción A del rediseño.
  publicSiteDir: process.env.PUBLIC_SITE_DIR || path.join(ROOT, '..', 'pandora-opcion-a'),
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  secureCookie: isProd,
  // Railway (y la mayoría de los PaaS) ponen un proxy delante: hace falta para la IP real y las cookies Secure.
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : isProd ? 1 : 0,
  // Intentos de login fallidos por IP cada 15 minutos.
  loginLimit: Number(process.env.LOGIN_LIMIT) || 10,
};
