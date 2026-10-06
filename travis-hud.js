(() => {
  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const hud = one('#travis-hud');
  if (!hud) return;

  const launcher = one('#travis-launcher');
  const closeButton = one('#travis-hud-close');
  const voiceText = one('#travis-voice-text');
  const voiceState = one('#travis-voice-state');
  const readyLabel = one('#travis-status-ready');
  const checks = many('.travis-check', hud);
  const clock = one('#travis-clock-time');
  const date = one('#travis-clock-date');
  const canvas = one('#travis-particles');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let timers = [];
  let raf = 0;
  let particles = [];

  const copy = {
    idle: ['Em repouso.', 'EM ESPERA'],
    booting: ['A iniciar sistemas.', 'INICIALIZANDO'],
    ready: ['Olá, estou aqui.', 'PRONTO'],
    listening: ['Estou a ouvir.', 'A OUVIR'],
    thinking: ['A organizar o pedido.', 'A PENSAR'],
    speaking: ['A responder.', 'A FALAR']
  };

  function setState(state = 'ready', message = '') {
    hud.dataset.state = state;
    const value = copy[state] || copy.ready;
    if (voiceText) voiceText.textContent = message || value[0];
    if (voiceState) voiceState.textContent = value[1];
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function resetChecks() {
    checks.forEach((item) => {
      item.classList.remove('is-ready');
      const icon = one('i', item);
      if (icon) icon.textContent = '·';
    });
    readyLabel?.classList.remove('is-ready');
  }

  function boot() {
    clearTimers();
    resetChecks();
    setState('booting');
    checks.forEach((item, index) => {
      timers.push(setTimeout(() => {
        item.classList.add('is-ready');
        const icon = one('i', item);
        if (icon) icon.textContent = '✓';
      }, 480 + index * 220));
    });
    timers.push(setTimeout(() => {
      readyLabel?.classList.add('is-ready');
      setState('ready');
    }, 480 + checks.length * 220 + 250));
  }

  function updateClock() {
    const now = new Date();
    if (clock) clock.textContent = new Intl.DateTimeFormat('pt-PT', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
    if (date) date.textContent = new Intl.DateTimeFormat('pt-PT', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    }).format(now).replaceAll('.', '').toUpperCase();
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(34, Math.min(88, Math.round(rect.width / 19)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      radius: Math.random() * 1.2 + .3,
      speed: Math.random() * .15 + .025,
      drift: (Math.random() - .5) * .07,
      alpha: Math.random() * .4 + .08,
      red: Math.random() > .86
    }));
  }

  function drawParticles() {
    if (!canvas || !ctx || !hud.classList.contains('is-open')) {
      raf = 0;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const particle of particles) {
      particle.y -= particle.speed;
      particle.x += particle.drift;
      if (particle.y < -8) {
        particle.y = rect.height + 8;
        particle.x = Math.random() * rect.width;
      }
      if (particle.x < -8) particle.x = rect.width + 8;
      if (particle.x > rect.width + 8) particle.x = -8;
      ctx.beginPath();
      ctx.fillStyle = particle.red
        ? 'rgba(255,68,96,' + particle.alpha + ')'
        : 'rgba(89,218,255,' + particle.alpha + ')';
      ctx.shadowBlur = 8;
      ctx.shadowColor = particle.red ? 'rgba(255,61,95,.45)' : 'rgba(77,209,255,.45)';
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    raf = requestAnimationFrame(drawParticles);
  }

  function startParticles() {
    resizeCanvas();
    if (!raf && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(drawParticles);
    }
  }

  function stopParticles() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function openHud() {
    hud.classList.remove('is-open');
    void hud.offsetWidth;
    hud.classList.add('is-open');
    hud.setAttribute('aria-hidden', 'false');
    document.body.classList.add('travis-hud-open');
    updateClock();
    startParticles();
    boot();
  }

  function closeHud() {
    clearTimers();
    stopParticles();
    hud.classList.remove('is-open');
    hud.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('travis-hud-open');
    setState('idle');
  }

  if (launcher) launcher.onclick = openHud;
  closeButton?.addEventListener('click', closeHud);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && hud.classList.contains('is-open')) closeHud();
  });

  many('.travis-module', hud).forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      closeHud();
      if (target === 'conversation') {
        window.TravisPanel?.open?.();
        return;
      }
      if (target) document.querySelector('[data-panel-target="' + target + '"]')?.click();
    });
  });

  window.addEventListener('resize', () => {
    if (hud.classList.contains('is-open')) resizeCanvas();
  }, { passive: true });

  setInterval(updateClock, 30000);
  updateClock();

  window.TravisVisual = Object.freeze({ open: openHud, close: closeHud, setState });
})();
