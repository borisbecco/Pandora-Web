(() => {
  const form = document.getElementById('login-form');
  const { role, username, password } = form.elements;
  const label = document.getElementById('username-label');
  const hint = document.getElementById('login-hint');
  const error = document.getElementById('login-error');
  const button = form.querySelector('button[type="submit"]');

  const COPY = {
    cliente: { label: 'Usuario de cliente', hint: 'Acceso de solo lectura al portal de SBASE.' },
    admin: { label: 'Usuario administrador', hint: 'Acceso para el equipo de Pandora: edición y publicación de actualizaciones.' },
  };

  const setError = (msg, fields = []) => {
    error.textContent = msg;
    error.hidden = !msg;
    [username, password].forEach((f) => f.closest('.field').classList.toggle('has-error', fields.includes(f)));
  };

  const syncRole = () => {
    const c = COPY[role.value];
    label.textContent = c.label;
    hint.textContent = c.hint;
  };

  form.addEventListener('change', (e) => { if (e.target.name === 'role') syncRole(); });
  form.addEventListener('input', () => { if (!error.hidden) setError(''); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empty = [username, password].filter((f) => !f.value.trim());
    if (empty.length) {
      setError('Completá usuario y contraseña para ingresar.', empty);
      empty[0].focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Ingresando…';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.value,
          password: password.value,
          role: role.value,
          next: new URLSearchParams(location.search).get('next'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return location.assign(data.redirect);

      setError(data.error || 'No se pudo ingresar. Probá de nuevo.', res.status === 401 ? [username, password] : []);
      password.value = '';
      password.focus();
    } catch {
      setError('No se pudo conectar. Revisá tu conexión y probá de nuevo.');
    }
    button.disabled = false;
    button.textContent = 'Ingresar';
  });

  syncRole();
})();
