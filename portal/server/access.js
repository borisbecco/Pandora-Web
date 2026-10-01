// Reglas de acceso compartidas por las rutas de páginas y de la API.

export const isAdmin = (user) => user?.role === 'admin';

// Un cliente solo ve su organización; un admin ve todas.
export const canViewOrg = (user, slug) => isAdmin(user) || user?.org_slug === slug;

export const homeFor = (user) => (isAdmin(user) ? '/admin/' : `/clientes/${user.org_slug}/`);

// Valida el parámetro ?next= del login: solo rutas internas del portal que el
// usuario puede ver. Cualquier otra cosa (otro dominio, //, \) se descarta.
export function safeNext(next, user) {
  if (typeof next !== 'string' || !next.startsWith('/')) return null;
  let url;
  try {
    url = new URL(next, 'http://portal.local');
  } catch {
    return null;
  }
  if (url.origin !== 'http://portal.local') return null;

  const target = url.pathname + url.search;
  if (/^\/admin(\/|$)/.test(url.pathname)) return isAdmin(user) ? target : null;
  const org = url.pathname.match(/^\/clientes\/([a-z0-9-]+)(\/|$)/);
  if (org) return canViewOrg(user, org[1]) ? target : null;
  return null;
}
