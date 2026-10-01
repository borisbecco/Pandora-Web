(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const hdr = $('.hdr');

  // Reveal al entrar en viewport
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  $$('.rv').forEach(el => io.observe(el));

  let raf = 0;
  function tick() {
    raf = 0;
    const y = scrollY, vh = innerHeight;
    hdr.classList.toggle('is-scrolled', y > 10);
    const mid = vh * .4; let cur = null;
    ['quienes-somos', 'servicios', 'contacto'].forEach(id => { const el = document.getElementById(id); if (el) { const r = el.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = id; } });
    $$('.nav a.nav__link').forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + cur));
    if (reduce) return;
    const p = clamp(y / vh);
    // Isotipo del hero: desplaza y rota; el punto crece
    const m = $('.a-hero__mark'); if (m) m.style.transform = `translateY(calc(-50% + ${p * 110}px)) rotate(${-p * 10}deg)`;
    const g = $('.a-hero .mk-dotg'); if (g) g.style.transform = `scale(${1 + p * .35})`;
    const t = $('.a-hero__in'); if (t) t.style.transform = `translateY(${-p * 40}px)`;
    // Isotipo de contacto: entra rotando
    const cm = $('.a-contact__mark');
    if (cm) { const r = cm.parentElement.getBoundingClientRect(); const q = clamp((vh - r.top) / (vh + r.height * .5)); cm.style.transform = `translateY(${(1 - q) * 140}px) rotate(${(1 - q) * 22}deg)`; }
  }
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  addEventListener('resize', tick);
  tick();

  // Formulario: validación de email + envío por fetch al atributo action (mismo mecanismo que pandora/).
  $$('form.cform').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const em = f.querySelector('[type=email]'), st = f.querySelector('.status'), btn = f.querySelector('button');
    const set = (msg, t) => { st.textContent = msg; st.className = 'status' + (t ? ' is-' + t : ''); };
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim());
    em.closest('.field').classList.toggle('has-error', !ok);
    if (!ok) { set('Ingresá un email válido para que podamos responderte.', 'error'); em.focus(); return; }
    const action = f.getAttribute('action');
    if (!action) { set('Falta configurar el destino del formulario (atributo action).', 'error'); return; }
    btn.disabled = true; set('Enviando…');
    try {
      const res = await fetch(action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      f.reset(); set('Mensaje enviado. Te respondemos a la brevedad.', 'ok');
    } catch {
      set('No se pudo enviar el mensaje. Probá de nuevo o escribinos por mail.', 'error');
    } finally {
      btn.disabled = false;
    }
  }));
})();
