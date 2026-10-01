// Sesión en páginas privadas: nombre del usuario, botones solo-admin y cerrar sesión.
(async () => {
  const toLogin = () => location.assign('/clientes/?next=' + encodeURIComponent(location.pathname + location.search));

  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.assign('/clientes/');
  }));

  const res = await fetch('/api/me').catch(() => null);
  if (!res || res.status === 401) return toLogin();
  const { user } = await res.json();

  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user.name; });
  document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = user.role !== 'admin'; });
})();
