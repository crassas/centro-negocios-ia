(() => {
  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const hud = one('#travis-hud');
  if (!hud) return;

  const launcher = one('#travis-launcher');
  const closeButton = one('#travis-hud-close');
  const coreButton = one('#travis-core-trigger');
  const statusMessage = one('#travis-status-message');
  const statusState = one('#travis-status-state');
  const clock = one('#travis-clock-time');
  const date = one('#travis-clock-date');
  const spaceCanvas = one('#travis-space-canvas');
  const coreCanvas = one('#travis-core-canvas');

  let timers = [];
  let spaceRaf = 0;
  let shaderRaf = 0;
  let particles = [];
  let audioContext = null;
  let visualState = 'idle';
  let webgl = null;

  const stateCopy = {
    idle: ['Em repouso.', 'EM ESPERA'],
    booting: ['A inicializar interface.', 'A INICIAR'],
    ready: ['Estou aqui.', 'PRONTO'],
    listening: ['A ouvir.', 'A OUVIR'],
    thinking: ['A processar.', 'A PENSAR'],
    speaking: ['A responder.', 'A FALAR']
  };

  function setState(state = 'ready', message = '') {
    visualState = state;
    hud.dataset.state = state;
    const [copy, label] = stateCopy[state] || stateCopy.ready;
    if (statusMessage) statusMessage.textContent = message || copy;
    if (statusState) statusState.textContent = label;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function updateClock() {
    const now = new Date();
    if (clock) {
      clock.textContent = new Intl.DateTimeFormat('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);
    }
    if (date) {
      date.textContent = new Intl.DateTimeFormat('pt-PT', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      }).format(now).replaceAll('.', '').toUpperCase();
    }
  }

  function buildSpace() {
    if (!spaceCanvas) return;
    const ctx = spaceCanvas.getContext('2d');
    if (!ctx) return;
    const rect = spaceCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    spaceCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    spaceCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(36, Math.min(92, Math.round(rect.width / 18)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      radius: Math.random() * 1.25 + .25,
      speed: Math.random() * .13 + .018,
      drift: (Math.random() - .5) * .065,
      alpha: Math.random() * .35 + .05,
      red: Math.random() > .9
    }));
  }

  function paintSpace() {
    if (!spaceCanvas || !hud.classList.contains('is-open')) {
      spaceRaf = 0;
      return;
    }
    const ctx = spaceCanvas.getContext('2d');
    if (!ctx) return;
    const rect = spaceCanvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const p of particles) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -6) {
        p.y = rect.height + 6;
        p.x = Math.random() * rect.width;
      }
      if (p.x < -6) p.x = rect.width + 6;
      if (p.x > rect.width + 6) p.x = -6;
      ctx.beginPath();
      ctx.fillStyle = p.red
        ? 'rgba(255,63,100,' + p.alpha + ')'
        : 'rgba(103,230,255,' + p.alpha + ')';
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.red ? 'rgba(255,63,100,.3)' : 'rgba(75,214,255,.28)';
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    spaceRaf = requestAnimationFrame(paintSpace);
  }

  function stateLevel() {
    if (visualState === 'booting') return .72;
    if (visualState === 'listening') return 1.0;
    if (visualState === 'thinking') return 1.28;
    if (visualState === 'speaking') return 1.42;
    if (visualState === 'ready') return .92;
    return .5;
  }

  function setupWebGL() {
    if (!coreCanvas) return null;
    const gl = coreCanvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true
    });
    if (!gl) return null;

    const vertex = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main(){
        v_uv = a_position * .5 + .5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragment = `
      precision mediump float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform float u_level;
      uniform vec2 u_resolution;

      float ring(float r, float radius, float width){
        return 1.0 - smoothstep(width, width * 2.0, abs(r - radius));
      }

      float segment(float angle, float count, float phase, float duty){
        float v = sin(angle * count + phase);
        return smoothstep(duty, duty + .16, v);
      }

      void main(){
        vec2 p = v_uv - .5;
        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        p.x *= aspect;

        float r = length(p);
        float a = atan(p.y, p.x);
        float t = u_time;

        vec3 cyan = vec3(.18,.78,1.0);
        vec3 cyan2 = vec3(.42,.94,1.0);
        vec3 red = vec3(1.0,.14,.31);
        vec3 col = vec3(0.0);
        float alpha = 0.0;

        float halo = exp(-r * 8.5) * .17 * u_level;
        col += cyan * halo;
        alpha += halo;

        float rr1 = ring(r,.245,.0045) * segment(a,14.0,t*.78,.18);
        float rr2 = ring(r,.325,.0060) * segment(a,18.0,-t*.55,.32);
        float rr3 = ring(r,.402,.0040) * segment(a,10.0,t*.35,.05);
        float rr4 = ring(r,.458,.0030) * segment(a,22.0,-t*.22,.52);

        col += cyan2 * rr1 * 1.1;
        col += cyan * rr2 * .82;
        col += cyan * rr3 * .52;
        col += red * rr4 * .55;
        alpha += rr1 * .9 + rr2 * .72 + rr3 * .45 + rr4 * .52;

        float redSeg = ring(r,.33,.010) * segment(a,7.0,t*.62,.69);
        col += red * redSeg * .84;
        alpha += redSeg * .7;

        vec2 ep = vec2(p.x, p.y * 2.85);
        float er = length(ep);
        float orbit1 = ring(er,.39,.0030);
        float orbit2 = ring(length(vec2(p.x*.86,p.y*3.4)),.31,.0024);
        col += cyan * (orbit1*.24 + orbit2*.16);
        alpha += orbit1*.2 + orbit2*.13;

        float spokes = segment(a,32.0,-t*.18,.78) * ring(r,.49,.008);
        col += cyan2 * spokes * .23;
        alpha += spokes * .18;

        float pulse = exp(-abs(r - (.19 + .009*sin(t*1.9))) * 48.0) * .12;
        col += cyan2 * pulse;
        alpha += pulse;

        float scan = .92 + .08*sin((v_uv.y + t*.035) * 900.0);
        col *= scan;

        float vignette = 1.0 - smoothstep(.25,.66,r);
        alpha *= vignette * min(1.0,u_level);
        col *= 1.0 + (u_level-.8)*.32;

        gl_FragColor = vec4(col, clamp(alpha,0.0,.95));
      }
    `;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Travis shader:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),
      gl.STATIC_DRAW
    );

    const pos = gl.getAttribLocation(program, 'a_position');
    const time = gl.getUniformLocation(program, 'u_time');
    const level = gl.getUniformLocation(program, 'u_level');
    const resolution = gl.getUniformLocation(program, 'u_resolution');

    return { gl, program, pos, time, level, resolution, started: performance.now() };
  }

  function resizeCore() {
    if (!coreCanvas || !webgl) return;
    const rect = coreCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));
    if (coreCanvas.width !== width || coreCanvas.height !== height) {
      coreCanvas.width = width;
      coreCanvas.height = height;
      webgl.gl.viewport(0, 0, width, height);
    }
  }

  function renderCore(now) {
    if (!webgl || !hud.classList.contains('is-open')) {
      shaderRaf = 0;
      return;
    }
    resizeCore();
    const { gl, program, pos, time, level, resolution, started } = webgl;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(time, (now - started) / 1000);
    gl.uniform1f(level, stateLevel());
    gl.uniform2f(resolution, coreCanvas.width, coreCanvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    shaderRaf = requestAnimationFrame(renderCore);
  }

  function startCore() {
    if (!webgl) webgl = setupWebGL();
    if (webgl && !shaderRaf && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shaderRaf = requestAnimationFrame(renderCore);
    }
  }

  function stopCore() {
    if (shaderRaf) cancelAnimationFrame(shaderRaf);
    shaderRaf = 0;
  }

  function bootTone() {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const start = audioContext.currentTime + .015;
      [0,.23,.46].forEach((delay,index) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = index === 2 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(78 + index * 16, start + delay);
        osc.frequency.exponentialRampToValueAtTime(118 + index * 22, start + delay + .18);
        gain.gain.setValueAtTime(.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(.055, start + delay + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, start + delay + .2);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(start + delay);
        osc.stop(start + delay + .21);
      });
    } catch {}
  }

  function bootSequence() {
    clearTimers();
    setState('booting');
    hud.classList.remove('deck-open');
    timers.push(setTimeout(() => setState('ready'), 1780));
  }

  function openHud() {
    hud.classList.remove('is-open');
    void hud.offsetWidth;
    hud.classList.add('is-open');
    hud.setAttribute('aria-hidden', 'false');
    launcher?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('travis-hud-open');
    updateClock();
    buildSpace();
    if (!spaceRaf && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spaceRaf = requestAnimationFrame(paintSpace);
    }
    startCore();
    bootTone();
    bootSequence();
  }

  function closeHud() {
    clearTimers();
    if (spaceRaf) cancelAnimationFrame(spaceRaf);
    spaceRaf = 0;
    stopCore();
    hud.classList.remove('deck-open','is-open');
    hud.setAttribute('aria-hidden', 'true');
    launcher?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('travis-hud-open');
    setState('idle');
  }

  function toggleDeck() {
    if (!hud.classList.contains('is-open')) return;
    hud.classList.toggle('deck-open');
    if (hud.classList.contains('deck-open')) setState('ready','Escolhe o que queres abrir.');
    else setState('ready');
  }

  function openCentrePanel(panel) {
    closeHud();
    document.querySelector('[data-panel-target="' + panel + '"]')?.click();
  }

  launcher?.addEventListener('click', openHud);
  closeButton?.addEventListener('click', closeHud);
  coreButton?.addEventListener('click', toggleDeck);

  many('[data-travis-panel]', hud).forEach((button) => {
    button.addEventListener('click', () => openCentrePanel(button.dataset.travisPanel));
  });
  one('[data-travis-action="close"]', hud)?.addEventListener('click', closeHud);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && hud.classList.contains('is-open')) closeHud();
  });

  window.addEventListener('resize', () => {
    if (!hud.classList.contains('is-open')) return;
    buildSpace();
    resizeCore();
  }, { passive:true });

  setInterval(updateClock, 30000);
  updateClock();

  window.TravisVisual = Object.freeze({
    open: openHud,
    close: closeHud,
    setState,
    commands: toggleDeck
  });

  // Compatibility only: the old green Travis panel no longer exists.
  // This keeps existing Centro callbacks safe until the intended Travis backend is connected.
  window.TravisPanel = {
    open: openHud,
    completeTask(id, text) {
      if (!hud.classList.contains('is-open')) return;
      setState('ready', text ? 'Tarefa concluída.' : 'Pronto.');
    }
  };
})();
