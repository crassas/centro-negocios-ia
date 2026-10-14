/* TRAVIS NATURAL VISUAL v1 — reduce image provenance/technical overlay chrome.
   Provenance is retained in the existing on-demand source dialog.
   This never changes factual content, media, navigation or Android permissions. */
(() => {
  'use strict';
  if (window.__travisNaturalVisualV1) return;
  window.__travisNaturalVisualV1 = true;

  const hud = document.getElementById('travis-hud');
  if (!hud) return;
  const style = document.createElement('style');
  style.id = 'travis-natural-visual-style';
  style.textContent = `
    #travis-hud .travis-sources-toggle:not([hidden]){
      top:auto!important; left:auto!important;
      right:clamp(12px,3vw,22px)!important;
      bottom:calc(170px + env(safe-area-inset-bottom, 0px))!important;
      z-index:25!important; display:flex!important;
      align-items:center!important; justify-content:center!important;
      padding:0!important; width:32px!important; height:32px!important;
      min-width:32px!important; min-height:32px!important;
      border:1px solid rgba(213,185,147,.12)!important;
      border-radius:50%!important; background:rgba(7,9,12,.32)!important;
      color:rgba(218,194,156,.65)!important;
      font:500 14px/1 system-ui,sans-serif!important;
      letter-spacing:0!important; opacity:.48!important;
      transition:opacity .16s ease, border-color .16s ease;
    }
    #travis-hud .travis-sources-toggle:focus-visible,
    #travis-hud .travis-sources-toggle:hover{
      opacity:1!important; border-color:rgba(213,185,147,.56)!important;
    }
    #travis-hud .travis-visual-caption small,
    #travis-hud .travis-visual-caption .travis-reference-photos,
    #travis-hud .travis-reference-credit,
    #travis-hud .travis-projection-caption,
    #travis-hud [data-travis-natural-hidden="true"]{
      display:none!important;
    }
    #travis-hud .travis-visual-caption{
      letter-spacing:.075em!important; text-shadow:0 1px 10px rgba(0,0,0,.7);
    }
    @media(max-width:650px){
      #travis-hud .travis-visual-caption{max-width:72%!important;}
    }
    @media(prefers-reduced-motion:reduce){
      #travis-hud .travis-sources-toggle{transition:none!important;}
    }
  `;
  document.head.appendChild(style);

  // Only recognise short, self-contained, non-narrative visual metadata labels.
  // Do not erase user or assistant conversation text or factual statements.
  const technical = [
    /^(?:fotografia\s+de\s+(?:fonte|refer[eê]ncia)|photographic\s+reference|reference\s+photograph)(?:\s*[·|—–-]\s*[^.!?]{1,90})?$/i,
    /^fotografia\s*[·|—–-]\s*relevo\b/i,
    /^(?:visualiza[cç][aã]o\s*2d|2d\s+visuali[sz]ation)(?:\s*[·|—–-].*)?$/i,
    /^(?:[·\s—–-]*n[aã]o\s+[ée]\s+(?:uma\s+)?malha\s*3d|not\s+(?:a\s+)?3d\s+mesh)\b/i,
    /^(?:imagem\s+de\s+refer[eê]ncia|reference\s+image)\s*[·|—–-]\s*(?:wikipedia|wikimedia|commons)/i
  ];
  const normalise = value => String(value || '').replace(/\s+/g, ' ').trim();
  const isTechnical = text => text.length > 0 && text.length <= 140 && technical.some(re => re.test(text));

  function quietVisualLabels() {
    const trigger = hud.querySelector('.travis-sources-toggle');
    if (trigger) {
      if (trigger.textContent !== 'ⓘ') trigger.textContent = 'ⓘ';
      trigger.setAttribute('aria-label', 'Informações e créditos da imagem');
      trigger.title = 'Informações e créditos da imagem';
    }
    const candidates = hud.querySelectorAll('small, figcaption, span, p, div');
    for (const el of candidates) {
      if (el.hasAttribute('data-travis-natural-hidden') || el.children.length ||
          el.closest('#travis-sources') || el.closest('#travis-action-deck') ||
          el.closest('[role="status"]') || el.closest('[aria-live]')) continue;
      const val = normalise(el.textContent);
      if (!isTechnical(val)) continue;
      // Do not hide transcribed user requests or the main dialogue bubble.
      if (el.closest('#travis-transcript, .travis-conversation, .travis-chat, .travis-voice-response')) continue;
      el.dataset.travisNaturalHidden = 'true';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; quietVisualLabels(); }, 45);
  }
  const observer = new MutationObserver(records => {
    if (records.some(r => r.type === 'childList' || r.type === 'characterData')) schedule();
  });
  observer.observe(hud, {subtree:true, childList:true, characterData:true});
  for (const type of ['travis:illustration','travis:visual-select','travis:result','travis:commands']) {
    window.addEventListener(type, schedule, {passive:true});
  }
  quietVisualLabels();
})();