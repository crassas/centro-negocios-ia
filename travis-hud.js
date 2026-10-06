(() => {
  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const hud = one('#travis-hud');
  if (!hud) return;

  const launcher = one('#travis-launcher');
  const closeButton = one('#travis-hud-close');
  const coreButton = one('#travis-core-trigger');
  const parallax = one('#travis-orb-parallax');
  const statusMessage = one('#travis-status-message');
  const statusState = one('#travis-status-state');
  const clock = one('#travis-clock-time');
  const date = one('#travis-clock-date');
  const spaceCanvas = one('#travis-space-canvas');
  const coreCanvas = null; // V4 core is rendered by travis-scene.js

  let timers = [];
  let spaceRaf = 0;
  let shaderRaf = 0;
  let particles = [];
  let audioContext = null;
  let visualState = 'idle';
  let webgl = null;
  let parallaxTarget = { x: 0, y: 0 };
  let parallaxNow = { x: 0, y: 0 };
  let parallaxRaf = 0;

  const stateCopy = {
    idle: ['Em repouso.', 'EM ESPERA'],
    booting: ['A inicializar núcleo.', 'A INICIAR'],
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

  function haptic(pattern = 16) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  }

  function ensureAudio() {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      return audioContext;
    } catch {
      return null;
    }
  }

  function connectVoice(node, gainValue, destination) {
    const gain = destination.createGain();
    gain.gain.value = gainValue;
    node.connect(gain).connect(destination.destination);
    return gain;
  }

  function bootTone() {
    const ac = ensureAudio();
    if (!ac) return;
    const start = ac.currentTime + .018;

    // Low body: gives weight without imitating any existing soundtrack.
    const low = ac.createOscillator();
    const lowGain = ac.createGain();
    low.type = 'sine';
    low.frequency.setValueAtTime(52, start);
    low.frequency.exponentialRampToValueAtTime(76, start + .72);
    lowGain.gain.setValueAtTime(.0001, start);
    lowGain.gain.exponentialRampToValueAtTime(.065, start + .05);
    lowGain.gain.exponentialRampToValueAtTime(.0001, start + .82);
    low.connect(lowGain).connect(ac.destination);
    low.start(start);
    low.stop(start + .85);

    // Four short activation pulses.
    [0,.18,.37,.59].forEach((delay,index) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = index % 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(94 + index * 26, start + delay);
      osc.frequency.exponentialRampToValueAtTime(148 + index * 34, start + delay + .13);
      gain.gain.setValueAtTime(.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(.034, start + delay + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, start + delay + .15);
      osc.connect(gain).connect(ac.destination);
      osc.start(start + delay);
      osc.stop(start + delay + .16);
    });

    // Final airy confirmation.
    const air = ac.createOscillator();
    const airGain = ac.createGain();
    air.type = 'sine';
    air.frequency.setValueAtTime(420, start + .71);
    air.frequency.exponentialRampToValueAtTime(620, start + 1.02);
    airGain.gain.setValueAtTime(.0001, start + .7);
    airGain.gain.exponentialRampToValueAtTime(.018, start + .76);
    airGain.gain.exponentialRampToValueAtTime(.0001, start + 1.08);
    air.connect(airGain).connect(ac.destination);
    air.start(start + .7);
    air.stop(start + 1.1);
  }

  function interactionTone(opening) {
    const ac = ensureAudio();
    if (!ac) return;
    const t = ac.currentTime + .01;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(opening ? 164 : 136, t);
    osc.frequency.exponentialRampToValueAtTime(opening ? 286 : 96, t + .12);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(.025, t + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t + .14);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + .15);
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
    const count = Math.max(38, Math.min(94, Math.round(rect.width / 18)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      radius: Math.random() * 1.15 + .24,
      speed: Math.random() * .12 + .014,
      drift: (Math.random() - .5) * .055,
      alpha: Math.random() * .32 + .045,
      red: Math.random() > .92,
      phase: Math.random() * Math.PI * 2
    }));
  }

  function paintSpace(now = 0) {
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
      const pulse = .72 + Math.sin(now * .0012 + p.phase) * .28;
      ctx.beginPath();
      ctx.fillStyle = p.red
        ? 'rgba(255,66,102,' + (p.alpha * pulse) + ')'
        : 'rgba(109,233,255,' + (p.alpha * pulse) + ')';
      ctx.shadowBlur = 7;
      ctx.shadowColor = p.red ? 'rgba(255,66,102,.26)' : 'rgba(77,214,255,.23)';
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    spaceRaf = requestAnimationFrame(paintSpace);
  }

  function stateLevel() {
    if (visualState === 'booting') return .78;
    if (visualState === 'listening') return 1.06;
    if (visualState === 'thinking') return 1.28;
    if (visualState === 'speaking') return 1.44;
    if (visualState === 'ready') return .94;
    return .52;
  }

  function setupWebGL() {
    if (!coreCanvas) return null;
    const gl = coreCanvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
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

      float hash(vec2 p){
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
      }

      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
                   mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);
      }

      float ring(float r,float radius,float width){
        return 1.0-smoothstep(width,width*2.2,abs(r-radius));
      }

      float seg(float a,float count,float phase,float threshold){
        return smoothstep(threshold,threshold+.16,sin(a*count+phase));
      }

      float sweep(float a,float phase,float width){
        float d = abs(atan(sin(a-phase),cos(a-phase)));
        return 1.0-smoothstep(width,width*1.7,d);
      }

      void main(){
        vec2 p=v_uv-.5;
        float aspect=u_resolution.x/max(u_resolution.y,1.0);
        p.x*=aspect;

        float r=length(p);
        float a=atan(p.y,p.x);
        float t=u_time;

        vec3 cyan=vec3(.18,.80,1.0);
        vec3 cyan2=vec3(.46,.96,1.0);
        vec3 blue=vec3(.04,.36,.88);
        vec3 red=vec3(1.0,.15,.34);
        vec3 col=vec3(0.0);
        float alpha=0.0;

        float n=noise(vec2(a*2.2,r*26.0-t*.45));
        float halo=exp(-r*7.8)*(.13+.07*n)*u_level;
        col+=mix(blue,cyan,n)*halo;
        alpha+=halo;

        float r1=ring(r,.235,.0043)*seg(a,16.0,t*.86,.12);
        float r2=ring(r,.304,.0055)*seg(a,21.0,-t*.62,.26);
        float r3=ring(r,.368,.0043)*seg(a,12.0,t*.39,-.04);
        float r4=ring(r,.432,.0036)*seg(a,26.0,-t*.28,.48);
        float r5=ring(r,.478,.0028)*seg(a,34.0,t*.18,.66);

        col+=cyan2*r1*1.18;
        col+=cyan*r2*.85;
        col+=mix(cyan,blue,.45)*r3*.68;
        col+=red*r4*.46;
        col+=cyan2*r5*.31;
        alpha+=r1*.92+r2*.72+r3*.56+r4*.42+r5*.28;

        float redArc=ring(r,.305,.009)*seg(a,7.0,t*.58,.67);
        col+=red*redArc*.82;
        alpha+=redArc*.64;

        float moving=sweep(a,t*.34,.055)*ring(r,.39,.018);
        col+=cyan2*moving*.76;
        alpha+=moving*.52;

        vec2 ep=vec2(p.x,p.y*2.85);
        vec2 ep2=vec2(p.x*.9,p.y*3.5);
        float orbit1=ring(length(ep),.39,.0028);
        float orbit2=ring(length(ep2),.31,.0022);
        col+=cyan*(orbit1*.23+orbit2*.15);
        alpha+=orbit1*.18+orbit2*.11;

        float spokes=seg(a,40.0,-t*.14,.79)*ring(r,.494,.007);
        col+=cyan2*spokes*.22;
        alpha+=spokes*.16;

        float energy=ring(r,.18+.009*sin(t*1.8),.013)*(.22+.18*n);
        col+=cyan2*energy;
        alpha+=energy*.72;

        float sparks=step(.985,noise(vec2(a*14.0+t*.15,r*120.0-t)))*
                     smoothstep(.46,.18,r)*.5;
        col+=cyan2*sparks;
        alpha+=sparks*.36;

        float scan=.93+.07*sin((v_uv.y+t*.031)*920.0);
        col*=scan;

        float vignette=1.0-smoothstep(.28,.68,r);
        alpha*=vignette*min(1.0,u_level);
        col*=1.0+(u_level-.82)*.34;

        gl_FragColor=vec4(col,clamp(alpha,0.0,.96));
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
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Travis shader link:', gl.getProgramInfoLog(program));
      return null;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),
      gl.STATIC_DRAW
    );

    return {
      gl,
      program,
      buffer,
      pos: gl.getAttribLocation(program,'a_position'),
      time: gl.getUniformLocation(program,'u_time'),
      level: gl.getUniformLocation(program,'u_level'),
      resolution: gl.getUniformLocation(program,'u_resolution'),
      started: performance.now()
    };
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
      webgl.gl.viewport(0,0,width,height);
    }
  }

  function renderCore(now) {
    if (!webgl || !hud.classList.contains('is-open')) {
      shaderRaf = 0;
      return;
    }
    // Three.js scene resizes through ResizeObserver.
    const { gl,program,buffer,pos,time,level,resolution,started } = webgl;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.uniform1f(time,(now-started)/1000);
    gl.uniform1f(level,stateLevel());
    gl.uniform2f(resolution,coreCanvas.width,coreCanvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES,0,6);
    shaderRaf=requestAnimationFrame(renderCore);
  }

  function startCore() {
    if (!webgl) webgl=setupWebGL();
    if (webgl && !shaderRaf && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shaderRaf=requestAnimationFrame(renderCore);
    }
  }

  function stopCore() {
    if (shaderRaf) cancelAnimationFrame(shaderRaf);
    shaderRaf=0;
  }

  function resetParallax() {
    parallaxTarget={x:0,y:0};
  }

  function animateParallax() {
    if (!hud.classList.contains('is-open')) {
      parallaxRaf=0;
      return;
    }
    parallaxNow.x += (parallaxTarget.x-parallaxNow.x)*.09;
    parallaxNow.y += (parallaxTarget.y-parallaxNow.y)*.09;
    const x=parallaxNow.x;
    const y=parallaxNow.y;
    hud.style.setProperty('--trv-ry',(x*3.2).toFixed(2)+'deg');
    hud.style.setProperty('--trv-rx',(-y*2.6).toFixed(2)+'deg');
    hud.style.setProperty('--trv-tx',(x*5).toFixed(2)+'px');
    hud.style.setProperty('--trv-ty',(y*4).toFixed(2)+'px');
    parallaxRaf=requestAnimationFrame(animateParallax);
  }

  function setParallaxFromEvent(event) {
    if (!hud.classList.contains('is-open')) return;
    const x=(event.clientX/window.innerWidth-.5)*2;
    const y=(event.clientY/window.innerHeight-.5)*2;
    parallaxTarget={x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y))};
  }

  function bootSequence() {
    clearTimers();
    setState('booting');
    hud.classList.remove('deck-open');
    timers.push(setTimeout(() => setState('ready'),1760));
  }

  function openHud() {
    hud.classList.remove('is-open');
    void hud.offsetWidth;
    hud.classList.add('is-open');
    hud.setAttribute('aria-hidden','false');
    launcher?.setAttribute('aria-expanded','true');
    document.body.classList.add('travis-hud-open');
    updateClock();
    buildSpace();
    if (!spaceRaf && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spaceRaf=requestAnimationFrame(paintSpace);
    }
    window.dispatchEvent(new CustomEvent('travis3dreset'));
    bootTone();
    haptic([12,36,10]);
    bootSequence();
  }

  function closeHud() {
    clearTimers();
    if (spaceRaf) cancelAnimationFrame(spaceRaf);
    if (parallaxRaf) cancelAnimationFrame(parallaxRaf);
    spaceRaf=0;
    parallaxRaf=0;
    window.dispatchEvent(new CustomEvent('travis3dreset'));
    resetParallax();
    hud.style.setProperty('--trv-rx','0deg');
    hud.style.setProperty('--trv-ry','0deg');
    hud.style.setProperty('--trv-tx','0px');
    hud.style.setProperty('--trv-ty','0px');
    hud.classList.remove('deck-open','is-open');
    hud.setAttribute('aria-hidden','true');
    launcher?.setAttribute('aria-expanded','false');
    document.body.classList.remove('travis-hud-open');
    setState('idle');
  }

  function toggleDeck() {
    if (!hud.classList.contains('is-open')) return;
    const opening=!hud.classList.contains('deck-open');
    hud.classList.toggle('deck-open',opening);
    window.dispatchEvent(new CustomEvent('travis3dcommands',{detail:{open:opening}}));
    interactionTone(opening);
    haptic(opening ? 18 : 10);
    setState('ready',opening ? 'Escolhe um módulo.' : 'Estou aqui.');
  }

  function openCentrePanel(panel) {
    interactionTone(false);
    haptic(12);
    closeHud();
    document.querySelector('[data-panel-target="'+panel+'"]')?.click();
  }

  launcher?.addEventListener('click',openHud);
  closeButton?.addEventListener('click',closeHud);
  coreButton?.addEventListener('click',toggleDeck);

  many('[data-travis-panel]',hud).forEach((button) => {
    button.addEventListener('click',() => openCentrePanel(button.dataset.travisPanel));
  });

  // Pointer parallax is owned by the real Three.js scene in V4.

  document.addEventListener('keydown',(event) => {
    if (event.key==='Escape' && hud.classList.contains('is-open')) closeHud();
  });

  window.addEventListener('resize',() => {
    if (!hud.classList.contains('is-open')) return;
    buildSpace();
    resizeCore();
  },{passive:true});

  setInterval(updateClock,30000);
  updateClock();

  window.TravisVisual=Object.freeze({
    open:openHud,
    close:closeHud,
    setState,
    commands:toggleDeck,
    listen(message='A ouvir.') {
      if (!hud.classList.contains('is-open')) openHud();
      setState('listening',message);
    },
    think(message='A processar.') {
      if (!hud.classList.contains('is-open')) openHud();
      setState('thinking',message);
    },
    speak(message='A responder.') {
      if (!hud.classList.contains('is-open')) openHud();
      setState('speaking',message);
    },
    ready(message='Estou aqui.') {
      if (!hud.classList.contains('is-open')) openHud();
      setState('ready',message);
    }
  });

  // Compatibility only. The legacy green modal is gone; callbacks now land in this HUD.
  window.TravisPanel={
    open:openHud,
    completeTask(id,text) {
      if (!hud.classList.contains('is-open')) return;
      setState('ready',text ? 'Tarefa concluída.' : 'Pronto.');
    }
  };
})();
