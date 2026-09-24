// Sombra en el header al scrollear
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Formulario de contacto
const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');

const setStatus = (msg, type) => {
  status.textContent = msg;
  status.className = 'contact__status' + (type ? ` is-${type}` : '');
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const emailField = form.email.closest('.field');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim());
  emailField.classList.toggle('has-error', !emailOk);
  if (!emailOk) {
    setStatus('Ingresá un email válido para que podamos responderte.', 'error');
    form.email.focus();
    return;
  }

  const action = form.getAttribute('action');
  if (!action) {
    setStatus('Falta configurar el destino del formulario (atributo action).', 'error');
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus('Enviando…');

  try {
    const res = await fetch(action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    setStatus('Mensaje enviado. Te respondemos a la brevedad.', 'ok');
  } catch {
    setStatus('No se pudo enviar el mensaje. Probá de nuevo o escribinos por mail.', 'error');
  } finally {
    button.disabled = false;
  }
});

// Año del footer
document.getElementById('year').textContent = new Date().getFullYear();
