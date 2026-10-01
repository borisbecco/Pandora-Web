# Portal de clientes + CMS

Servidor Node (Express + SQLite) que sirve:

| Ruta | Qué es | Acceso |
|---|---|---|
| `/` | Sitio público (por ahora `../pandora-opcion-a`) | Público |
| `/clientes/` | Login | Público |
| `/clientes/:org/…` | Portal del cliente | Cliente de esa organización, o admin |
| `/admin/…` | CMS | Solo admin (403 para clientes) |
| `/api/…` | API JSON | Según la ruta |

Diseño: `../design_handoff_portal_clientes/`.

## Correr en local

```sh
cd portal
npm install
cp .env.example .env     # opcional
npm run seed             # crea SBASE, el admin y el cliente (muestra las contraseñas generadas)
npm run dev              # http://localhost:3000
npm test
```

## Autenticación

- Sesión con cookie `pandora_sid` (`HttpOnly`, `SameSite=Lax`, `Secure` en producción). En la base solo se guarda el hash SHA-256 del token, así que cerrar sesión o dar de baja a un usuario corta el acceso en el momento.
- Contraseñas con bcrypt (costo 12). Límite de intentos fallidos por IP (`LOGIN_LIMIT` cada 15 min).
- El selector Cliente/Administrador del login solo elige el destino; el permiso sale del rol guardado en `users.role`.
- Las páginas privadas y la API responden `Cache-Control: no-store`.

## Estructura

```
server/   app.js (rutas), auth.js (sesiones), access.js (reglas de acceso), db.js (migraciones), seed.js
public/
  pages/    HTML que el servidor entrega solo después de chequear permisos
  assets/   CSS, JS e imágenes (públicos; no contienen datos)
test/     tests de acceso (node --test)
data/     base SQLite (fuera de git)
```

`public/assets/css/tokens.css` es copia de `pandora-opcion-a/css/tokens.css`; cuando se elija el diseño definitivo, se unifican.
