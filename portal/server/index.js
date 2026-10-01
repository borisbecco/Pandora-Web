import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb(config.dbPath);
const app = createApp({ db, config });

const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (n === 0) console.warn('No hay usuarios. Corré `npm run seed` para crear el admin y el cliente de SBASE.');

const purge = () => app.locals.auth.purgeExpired();
purge();
setInterval(purge, 60 * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`Portal escuchando en http://localhost:${config.port}`);
  console.log(`  Sitio público: ${config.publicSiteDir}`);
  console.log(`  Base de datos: ${config.dbPath}`);
});
