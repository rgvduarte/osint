// Olha a bola de Berlim! Jogo tipo Angry Birds da noiva: num verão, a Inês vendeu bolas de Berlim
// na praia de Sesimbra; aqui atira-as contra porcos de fato de banho que invadiram a praia.
// Física com Matter.js (vendor/matter.min.js, MIT), carregado só quando o jogo aparece no ecrã.
import { TEXTOS } from './berlim-textos.js';
import { criarPlacar, ligarSubmissao, mostrarPainel, calmo, load, save } from './placar.js';

const W = 360, H = 540, GROUND = 470;
const HAND = { x: 80, y: GROUND - 82 };      // de onde sai a bola
const BALL_R = 11, MAX_PULL = 90, MAX_SPEED = 11.5; // px, px, px por passo de 1/60 s
const STEP = 1000 / 60;
const POP = 2.4;                             // velocidade de impacto (px/passo) que derrota um porco
const CREME_R = 85;                          // raio do empurrão do creme
const CREME_KO = 56;                         // raio em que o creme derruba porcos (é o que se vê no salpico)
const PTS = { porco: 1000, nivel: 2000, bola: 1500 };
const LB_KEY = 'xinxers-berlim-local', BEST_KEY = 'xinxers-berlim-recorde';
const INK = '#2a1f17';
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Níveis: peças pousadas na areia (y = centro). k: madeira | prancha | geleira | areia | porco
const G = GROUND;
const NIVEIS = [
  { bolas: 4, pecas: [ // primeira fornada: geleiras, uma prancha e uma torre de areia
    { k: 'geleira', x: 205, y: G - 13, w: 34, h: 26 },
    { k: 'geleira', x: 245, y: G - 13, w: 34, h: 26 },
    { k: 'prancha', x: 225, y: G - 31, w: 86, h: 10, cor: '#2f9e8f' },
    { k: 'porco', x: 225, y: G - 50, r: 14, tipo: 'boia' },
    { k: 'areia', x: 292, y: G - 14, w: 28, h: 28 },
    { k: 'areia', x: 292, y: G - 42, w: 28, h: 28 },
    { k: 'porco', x: 292, y: G - 70, r: 14, tipo: 'biquini' },
    { k: 'areia', x: 322, y: G - 11, w: 20, h: 22 },
    { k: 'porco', x: 346, y: G - 13, r: 13, tipo: 'calcoes' },
  ] },
  { bolas: 5, pecas: [ // castelos com recheio: por fora areia, por dentro porco
    { k: 'areia', x: 190, y: G - 20, w: 10, h: 40 },
    { k: 'areia', x: 226, y: G - 20, w: 10, h: 40 },
    { k: 'porco', x: 208, y: G - 12, r: 12, tipo: 'calcoes' },
    { k: 'areia', x: 262, y: G - 20, w: 10, h: 40 },
    { k: 'areia', x: 298, y: G - 20, w: 10, h: 40 },
    { k: 'porco', x: 280, y: G - 12, r: 12, tipo: 'fato' },
    { k: 'prancha', x: 280, y: G - 45, w: 54, h: 10, cor: '#f2b632' },
    { k: 'porco', x: 280, y: G - 63, r: 13, tipo: 'boia' },
    { k: 'areia', x: 336, y: G - 12, w: 24, h: 24 },
    { k: 'areia', x: 336, y: G - 36, w: 24, h: 24 },
    { k: 'porco', x: 336, y: G - 61, r: 13, tipo: 'biquini' },
  ] },
  { bolas: 4, pecas: [ // bandeira vermelha: tomaram a torre do nadador-salvador, e a caixa das bolas
    { k: 'areia', x: 200, y: G - 24, w: 24, h: 48 },
    { k: 'porco', x: 228, y: G - 13, r: 13, tipo: 'calcoes' },
    { k: 'madeira', x: 250, y: G - 45, w: 10, h: 90 },
    { k: 'madeira', x: 310, y: G - 45, w: 10, h: 90 },
    { k: 'porco', x: 280, y: G - 13, r: 13, tipo: 'fato' },
    { k: 'madeira', x: 280, y: G - 95, w: 84, h: 10, bandeira: true },
    { k: 'porco', x: 266, y: G - 115, r: 15, tipo: 'boia' },
    { k: 'caixa', x: 302, y: G - 109, w: 24, h: 18 },
    { k: 'prancha', x: 326, y: G - 35, w: 12, h: 70, cor: '#e8573c' },
    { k: 'porco', x: 347, y: G - 13, r: 13, tipo: 'biquini' },
  ] },
];
const COR = { madeira: '#c8934f', geleira: '#3b82c4', areia: '#e2c27f', caixa: '#fbf7ee' };

let matterP = null;
function carregarMatter() {
  if (window.Matter) return Promise.resolve(window.Matter);
  matterP ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/matter.min.js';
    s.onload = () => res(window.Matter);
    s.onerror = () => { matterP = null; s.remove(); rej(new Error('Não foi possível carregar a física (matter.js)')); };
    document.head.append(s);
  });
  return matterP;
}

export function initBerlim(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    over: root.querySelector('[data-over]'),
    overTitle: root.querySelector('[data-over-title]'),
    overText: root.querySelector('[data-over-text]'),
    verdict: root.querySelector('[data-over-verdict]'),
    name: root.querySelector('[data-name]'),
    submit: root.querySelector('[data-submit]'),
    again: root.querySelector('[data-again]'),
    board: root.querySelector('[data-board]'),
    boardNote: root.querySelector('[data-board-note]'),
  };
  const cara = new Image(); cara.src = 'assets/ines-cara.jpg';
  const lingua = new Image(); lingua.src = 'assets/ines-lingua.jpg';

  for (const el of root.querySelectorAll('[data-t]')) el.textContent = TEXTOS[el.dataset.t];

  function resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * (H / W) * dpr);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  let M = null;        // Matter, quando carregar
  let g = null;        // estado da partida
  // intro | pronto (à espera de mira) | mira (a arrastar) | voo | assentar | banner | over
  let mode = 'intro';
  const jogando = () => mode !== 'intro' && mode !== 'over';
  const setMode = (m) => { mode = m; canvas.parentElement.classList.toggle('playing', jogando()); };
  let raf = 0, last = 0, acc = 0;
  let drag = null;      // início do arrasto de pontaria
  // saiu do ecrã a meio: fica suspensa e só volta com um toque limpo (um deslizar para fazer scroll não conta)
  let suspensa = false;
  let best = load(BEST_KEY, 0);
  const placar = criarPlacar({ path: 'berlim', localKey: LB_KEY, board: ui.board, note: ui.boardNote });
  const resetPainel = ligarSubmissao(ui, placar, () => (mode === 'over' ? g : null));

  // ---- mundo
  function construir(n) {
    const { Engine, Bodies, Composite, Events } = M;
    const engine = Engine.create({ enableSleeping: true });
    engine.positionIterations = 8; engine.velocityIterations = 6;
    const chao = Bodies.rectangle(W / 2, GROUND + 30, W * 4, 60, { isStatic: true, friction: 0.9, label: 'chao' });
    Composite.add(engine.world, chao);
    const porcos = [];
    for (const p of NIVEIS[n].pecas) {
      let b;
      if (p.k === 'porco') {
        b = Bodies.circle(p.x, p.y, p.r, { density: 0.0015, friction: 0.6, restitution: 0.2, label: 'porco' });
        b.plugin = { k: 'porco', r: p.r, tipo: p.tipo };
        porcos.push(b);
      } else {
        const opts = { density: p.k === 'geleira' ? 0.003 : p.k === 'areia' ? 0.0025 : 0.002, friction: 0.8, restitution: 0.05, label: p.k };
        b = p.k === 'prancha'
          ? Bodies.rectangle(p.x, p.y, p.w, p.h, { ...opts, chamfer: { radius: Math.min(p.w, p.h) / 2 - 0.5 } })
          : Bodies.rectangle(p.x, p.y, p.w, p.h, opts);
        b.plugin = { k: p.k, w: p.w, h: p.h, cor: p.cor || COR[p.k], bandeira: p.bandeira };
      }
      Composite.add(engine.world, b);
      // (começam acordadas: se começassem a dormir, as de cima ficavam a flutuar quando o apoio caía)
    }
    Events.on(engine, 'collisionStart', (ev) => {
      for (const pair of ev.pairs) {
        const { bodyA: a, bodyB: b, collision } = pair;
        const n = collision.normal;
        const rel = Math.abs((a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y);
        if (rel < POP) continue;
        if (a.label === 'porco') derrotar(a);
        if (b.label === 'porco') derrotar(b);
      }
    });
    return { engine, porcos };
  }

  function derrotar(p) {
    if (p.plugin.morto) return;
    p.plugin.morto = true;
    g.remover.push(p); // tira-se do mundo depois do passo da física (pode ser chamado a meio de uma colisão)
    g.score += PTS.porco;
    g.porcosFora += 1;
    g.acertou = true;
    g.fx.push({ k: 'puf', x: p.position.x, y: p.position.y, t: 0 });
    say(`${pick(TEXTOS.gritos.porco)} +${PTS.porco}`, '#f5c542', Math.max(90, p.position.y - 40));
    g.lingua = 1.3;
  }

  function vivos() { return g.mundo.porcos.filter((p) => !p.plugin.morto); }

  function newGame() {
    g = { nivel: 0, bolas: 0, score: 0, porcosFora: 0, niveis: 0, t: 0, texts: [], fx: [], lingua: 0,
      mundo: null, bola: null, creme: false, remover: [], pull: null, kb: { ang: 40, pow: 0.75, on: false },
      wait: 0, still: 0, voo: 0, acertou: false, submitted: false };
    iniciarNivel(0);
  }

  function iniciarNivel(n) {
    g.nivel = n;
    g.bolas = NIVEIS[n].bolas;
    g.mundo = construir(n);
    g.bola = null;
    g.fx = [];
    const N = TEXTOS.niveis[n];
    say(N.nome, '#f5c542', H * 0.2, 2);
    say(N.frase, '#f6efe0', H * 0.2 + 28, 2, 16);
    setMode('banner'); g.wait = 1.4;
  }

  function say(text, color = '#f5c542', y = H * 0.3, life = 1.5, size = 22) {
    g.texts.push({ text, x: W / 2, y, life, color, size });
  }

  let aArrancar = false;
  let carga = ''; // '' | 'a' (a carregar a física) | 'erro'
  async function start() {
    if (aArrancar) return;
    aArrancar = true;
    if (!M) { carga = 'a'; draw(); }
    try {
      M = M || await Promise.race([carregarMatter(), new Promise((_, rej) => setTimeout(() => rej(new Error('prazo')), 15000))]);
      carga = '';
    } catch (e) { console.warn(e); carga = 'erro'; matterP = null; draw(); return; } finally { aArrancar = false; }
    suspensa = false;
    newGame();
    ui.over.hidden = true;
  }
  function retomar() {
    suspensa = false;
    setMode(mode); // volta a prender os toques no canvas
    last = performance.now(); acc = 0;
  }

  // velocidade de lançamento a partir do puxão (arrastar para trás, como numa fisga)
  function velocidade(pull) {
    const len = Math.hypot(pull.x, pull.y);
    const k = Math.min(len, MAX_PULL) / MAX_PULL * MAX_SPEED / (len || 1);
    return { x: pull.x * k, y: pull.y * k };
  }
  function pullDoTeclado() {
    const a = g.kb.ang * Math.PI / 180, len = g.kb.pow * MAX_PULL;
    return { x: Math.cos(a) * len, y: -Math.sin(a) * len };
  }

  function atirar(pull) {
    const v = velocidade(pull);
    const b = M.Bodies.circle(HAND.x, HAND.y, BALL_R, { density: 0.005, friction: 0.4, restitution: 0.3, frictionAir: 0.002, label: 'bola' });
    M.Composite.add(g.mundo.engine.world, b);
    M.Body.setVelocity(b, v);
    M.Body.setAngularVelocity(b, 0.2);
    g.bola = b; g.bolas -= 1; g.creme = false; g.still = 0; g.voo = 0; g.acertou = false; g.pull = null;
    say(pick(TEXTOS.gritos.lancamento), '#f6efe0', H * 0.14, 1.1, 18);
    setMode('voo');
  }

  // um toque com a bola no ar: rebenta em creme e empurra tudo à volta
  function creme() {
    if (!g.bola || g.creme) return;
    g.creme = true;
    const c = { ...g.bola.position };
    M.Composite.remove(g.mundo.engine.world, g.bola);
    g.bola = null;
    g.fx.push({ k: 'creme', x: c.x, y: c.y, t: 0 });
    say(pick(TEXTOS.gritos.creme), '#fff6d8', Math.max(90, c.y - 50), 1.2);
    for (const b of M.Composite.allBodies(g.mundo.engine.world)) {
      if (b.isStatic) continue;
      const dx = b.position.x - c.x, dy = b.position.y - c.y, d = Math.hypot(dx, dy);
      if (d > CREME_R) continue;
      if (b.label === 'porco' && d < CREME_KO) { derrotar(b); continue; }
      const f = (1 - d / CREME_R) * 7;
      M.Sleeping.set(b, false);
      M.Body.setVelocity(b, { x: b.velocity.x + (dx / (d || 1)) * f, y: b.velocity.y + (dy / (d || 1)) * f - f * 0.3 });
    }
    setMode('assentar'); g.wait = 3;
  }

  function fimDoTiro() {
    if (!g.acertou) say(pick(TEXTOS.gritos.falhou), '#f6efe0', H * 0.18, 1.2, 18);
    if (!vivos().length) {
      const bonus = PTS.nivel + PTS.bola * g.bolas;
      g.score += bonus; g.niveis += 1;
      say(`${pick(TEXTOS.gritos.nivel)} +${bonus}`, '#f5c542', H * 0.3, 1.8);
      if (g.nivel + 1 < NIVEIS.length) { setMode('banner'); g.wait = 1.8; g.proximo = g.nivel + 1; return; }
      setMode('banner'); g.wait = 1.8; g.proximo = -1; return;
    }
    if (g.bolas > 0) { setMode('pronto'); return; }
    fim();
  }

  function fim() {
    setMode('over');
    const newBest = g.score > best;
    if (newBest) { best = g.score; save(BEST_KEY, best); }
    ui.overTitle.textContent = `${g.score} pontos`;
    ui.overText.textContent = `${g.porcosFora} porco${g.porcosFora === 1 ? '' : 's'} derrotado${g.porcosFora === 1 ? '' : 's'}, ${g.niveis} de ${NIVEIS.length} níveis limpos.`;
    if (newBest && g.score > 0) ui.overText.textContent += ' ' + pick(TEXTOS.recorde_frases);
    const v = [...TEXTOS.veredictos].sort((a, b) => a.min - b.min).filter((q) => g.score >= q.min).pop();
    ui.verdict.textContent = v ? v.texto : '';
    resetPainel(g.score > 0);
    mostrarPainel(ui);
    placar.render();
  }

  // um passo de 1/60 s
  function passo() {
    const dt = STEP / 1000;
    g.t += dt;
    g.lingua = Math.max(0, g.lingua - dt);
    for (const tx of g.texts) { tx.life -= dt; tx.y -= dt * 18; }
    g.texts = g.texts.filter((tx) => tx.life > 0);
    for (const f of g.fx) f.t += dt;
    g.fx = g.fx.filter((f) => f.t < 1);
    if (mode === 'banner') {
      if ((g.wait -= dt) <= 0) {
        if (g.proximo === -1) return fim();
        if (g.proximo !== undefined) { const n = g.proximo; g.proximo = undefined; return iniciarNivel(n); }
        setMode('pronto');
      }
      return;
    }
    M.Engine.update(g.mundo.engine, STEP);
    for (const p of g.remover) M.Composite.remove(g.mundo.engine.world, p);
    g.remover = [];
    // porcos que caem para fora do ecrã também contam
    for (const p of vivos()) if (p.position.y > H + 40 || p.position.x + p.plugin.r < 0 || p.position.x - p.plugin.r > W) derrotar(p);
    // o último porco pode cair já depois do tiro (a rolar, empurrado): fecha o nível na mesma
    if ((mode === 'pronto' || mode === 'mira') && !vivos().length) { drag = null; g.pull = null; g.acertou = true; return fimDoTiro(); }
    if (mode === 'voo') {
      g.voo += dt;
      const b = g.bola;
      const fora = b.position.x > W + 60 || b.position.x < -60 || b.position.y > H + 60;
      g.still = Math.hypot(b.velocity.x, b.velocity.y) < 0.15 ? g.still + 1 : 0;
      if (fora || g.still > 40 || g.voo > 7) { setMode('assentar'); g.wait = 3; }
    } else if (mode === 'assentar') {
      g.wait -= dt;
      const mexe = M.Composite.allBodies(g.mundo.engine.world).some((b) => !b.isStatic && !b.isSleeping && b.label !== 'bola' && Math.hypot(b.velocity.x, b.velocity.y) > 0.12);
      if (!mexe || g.wait <= 0) {
        if (g.bola) { M.Composite.remove(g.mundo.engine.world, g.bola); g.bola = null; }
        fimDoTiro();
      }
    }
  }

  // ---- desenho
  function fitFont(text, size, max, weight = 400, family = '"Luckiest Guy", "Arial Black", sans-serif') {
    do ctx.font = `${weight} ${size}px ${family}`;
    while (ctx.measureText(text).width > max && --size > 9);
  }
  function outlined(text, x, y, size, fill = '#f5c542', max = W - 28) {
    fitFont(text, size, max);
    ctx.lineWidth = Math.max(4, size / 6); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawPraia() {
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#8fc9ea'); sky.addColorStop(1, '#dff0f6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 300);
    // sol
    ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(292, 70, 26, 0, Math.PI * 2); ctx.fill();
    // a serra e o castelo de Sesimbra lá em cima
    ctx.fillStyle = '#8aa872';
    ctx.beginPath(); ctx.moveTo(150, 300); ctx.quadraticCurveTo(230, 190, 300, 205); ctx.quadraticCurveTo(340, 212, W, 240); ctx.lineTo(W, 300); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9b48f'; ctx.strokeStyle = 'rgba(42,31,23,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(262, 190, 58, 18); ctx.fill(); ctx.stroke();
    for (let x = 262; x < 320; x += 8) { ctx.fillRect(x, 185, 5, 6); ctx.strokeRect(x, 185, 5, 6); }
    ctx.beginPath(); ctx.rect(284, 172, 14, 20); ctx.fill(); ctx.stroke();
    // casinhas brancas da vila
    for (const [x, y] of [[170, 282], [186, 276], [204, 280], [222, 272], [240, 278]]) {
      ctx.fillStyle = '#fbf7ee'; ctx.fillRect(x, y, 14, 12);
      ctx.fillStyle = '#d06a3a'; ctx.fillRect(x - 1, y - 3, 16, 4);
    }
    // mar
    ctx.fillStyle = '#2f7fb5'; ctx.fillRect(0, 300, W, 70);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    const off = calmo() ? 0 : ((g ? g.t : performance.now() / 1000) * 12) % 40;
    for (let y = 315; y < 370; y += 16) {
      ctx.beginPath();
      for (let x = -40 + off; x < W + 40; x += 40) { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 4, x + 20, y); }
      ctx.stroke();
    }
    // areia
    const sand = ctx.createLinearGradient(0, 370, 0, H);
    sand.addColorStop(0, '#f1dca5'); sand.addColorStop(1, '#e3c485');
    ctx.fillStyle = sand; ctx.fillRect(0, 368, W, H - 368);
    ctx.fillStyle = 'rgba(42,31,23,.12)';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, 380 + ((i * 53) % 150), 2, 2);
    ctx.strokeStyle = 'rgba(42,31,23,.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
    // chapéu de sol atrás da Inês
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20, GROUND); ctx.lineTo(28, GROUND - 120); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#fbf7ee' : '#d8322a';
      ctx.beginPath(); ctx.moveTo(28, GROUND - 124);
      ctx.arc(28, GROUND - 124, 48, Math.PI + i * Math.PI / 4, Math.PI + (i + 1) * Math.PI / 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawFace(img, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip();
    if (img.complete && img.naturalWidth) ctx.drawImage(img, x - r - 2, y - r - 2, (r + 2) * 2, (r + 2) * 2);
    else { ctx.fillStyle = '#e8c9a0'; ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }

  // a Inês, com a caixa das bolas de Berlim
  function drawInes(aim) {
    const x = 52, hip = GROUND - 34, sh = GROUND - 62;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = INK;
    // pernas e calções
    ctx.lineWidth = 6;
    for (const dx of [-5, 5]) { ctx.beginPath(); ctx.moveTo(x + dx, hip); ctx.lineTo(x + dx * 1.4, GROUND - 2); ctx.stroke(); }
    ctx.fillStyle = '#3d5f8f'; ctx.lineWidth = 2.5; rr(x - 12, hip - 8, 24, 13, 3); ctx.fill(); ctx.stroke();
    // t-shirt
    ctx.fillStyle = '#fbf7ee';
    ctx.beginPath(); ctx.moveTo(x - 13, sh); ctx.lineTo(x + 13, sh); ctx.lineTo(x + 11, hip - 6); ctx.lineTo(x - 11, hip - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    // caixa das bolas, a tiracolo
    ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 11, sh + 1); ctx.lineTo(x - 22, hip - 4); ctx.stroke();
    ctx.fillStyle = '#fbf7ee'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; rr(x - 38, hip - 14, 26, 20, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d8322a'; ctx.fillRect(x - 38, hip - 8, 26, 6);
    // braço de atirar: aponta para trás enquanto se faz pontaria
    ctx.lineWidth = 5; ctx.strokeStyle = INK;
    const hx = aim ? HAND.x + aim.x : HAND.x, hy = aim ? HAND.y + aim.y : HAND.y;
    ctx.beginPath(); ctx.moveTo(x + 12, sh + 3); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 12, sh + 3); ctx.lineTo(x - 18, hip - 8); ctx.stroke();
    ctx.restore();
    drawFace(g && g.lingua > 0 ? lingua : cara, x, sh - 20, 21);
  }

  function drawBola(x, y, a = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#d08a3c'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2c070'; ctx.beginPath(); ctx.ellipse(0, 0, BALL_R, 3, 0, 0, Math.PI * 2); ctx.fill(); // a risca clara
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(BALL_R * 0.55, 0, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill(); // o creme
    ctx.fillStyle = '#fff'; for (const [sx, sy] of [[-4, -6], [2, -7], [5, 6], [-6, 5], [-1, 7]]) ctx.fillRect(sx, sy, 1.6, 1.6); // açúcar
    ctx.restore();
  }

  function drawPeca(p, x, y, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    const w = p.w, h = p.h;
    if (p.k === 'prancha') {
      rr(-w / 2, -h / 2, w, h, Math.min(w, h) / 2); ctx.fillStyle = p.cor; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      if (w > h) ctx.fillRect(-w / 2 + 6, -1.5, w - 12, 3); else ctx.fillRect(-1.5, -h / 2 + 6, 3, h - 12);
    } else if (p.k === 'geleira') {
      ctx.fillStyle = p.cor; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#fbf7ee'; ctx.fillRect(-w / 2, -h / 2, w, 7); ctx.strokeRect(-w / 2, -h / 2, w, 7);
      ctx.fillStyle = INK; ctx.fillRect(-6, -h / 2 + 2, 12, 3);
    } else if (p.k === 'caixa') {
      // a caixa das bolas de Berlim, roubada pelos porcos
      ctx.fillStyle = p.cor; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#d8322a'; ctx.fillRect(-w / 2, -1, w, 5);
    } else if (p.k === 'areia') {
      ctx.fillStyle = p.cor; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(42,31,23,.18)';
      for (const [dx, dy] of [[-0.25, -0.2], [0.2, 0.1], [-0.1, 0.3], [0.3, -0.3]]) ctx.fillRect(dx * w, dy * h, 2, 2);
    } else {
      if (p.bandeira) {
        // mastro com a bandeira vermelha, na plataforma da torre
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(w / 2 - 6, -h / 2); ctx.lineTo(w / 2 - 6, -h / 2 - 46); ctx.stroke();
        ctx.fillStyle = '#d8322a'; ctx.beginPath(); ctx.moveTo(w / 2 - 6, -h / 2 - 46); ctx.lineTo(w / 2 + 16, -h / 2 - 39); ctx.lineTo(w / 2 - 6, -h / 2 - 32); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = p.cor; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(42,31,23,.3)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (w > h) { ctx.moveTo(-w / 2 + 4, 0); ctx.lineTo(w / 2 - 4, 0); } else { ctx.moveTo(0, -h / 2 + 4); ctx.lineTo(0, h / 2 - 4); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // porcos de fato de banho
  function drawPorco(x, y, r, a, tipo) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    // orelhas
    ctx.fillStyle = '#f19bb0';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.35, -r * 0.8); ctx.lineTo(s * r * 0.8, -r * 1.2); ctx.lineTo(s * r * 0.8, -r * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#f7b6c6';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // o fato de banho (dentro do corpo)
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    if (tipo === 'calcoes') {
      ctx.fillStyle = '#2f5d9e'; ctx.fillRect(-r, r * 0.35, 2 * r, r);
      ctx.fillStyle = '#f5c542'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.4 - 1.5, r * 0.35, 3, r);
    } else if (tipo === 'fato') {
      ctx.fillStyle = '#d8322a'; ctx.fillRect(-r, r * 0.05, 2 * r, r);
      ctx.fillRect(-r * 0.45, -r, 3, r); ctx.fillRect(r * 0.45 - 3, -r, 3, r);
      ctx.fillStyle = '#fbf7ee'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-r * 0.6 + i * r * 0.3, r * 0.5, 1.8, 0, Math.PI * 2); ctx.fill(); }
    } else if (tipo === 'biquini') {
      ctx.fillStyle = '#e24aa0';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.15, r * 0.05); ctx.lineTo(s * r * 0.7, r * 0.05); ctx.lineTo(s * r * 0.42, -r * 0.3); ctx.closePath(); ctx.fill(); }
      ctx.fillRect(-r, r * 0.6, 2 * r, r * 0.25);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    // focinho e olhos
    ctx.fillStyle = '#f19bb0'; ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.38, r * 0.27, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.13, -r * 0.05, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
    if (tipo === 'boia' || tipo === 'biquini') {
      // óculos de sol
      ctx.fillStyle = INK; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.36, -r * 0.45, r * 0.22, r * 0.15, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillRect(-r * 0.2, -r * 0.5, r * 0.4, 2);
    } else {
      ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.36, -r * 0.45, r * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = INK; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.33, -r * 0.43, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
    }
    if (tipo === 'boia') {
      // boia amarela à cintura
      ctx.lineWidth = r * 0.34; ctx.strokeStyle = '#f5c542';
      ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 1.1, r * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 1.1 + r * 0.17, r * 0.36 + r * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMundo() {
    if (!g || !g.mundo) {
      // antes de começar: o 1.º nível, parado
      for (const p of NIVEIS[0].pecas) {
        if (p.k === 'porco') drawPorco(p.x, p.y, p.r, 0, p.tipo);
        else drawPeca({ ...p, cor: p.cor || COR[p.k] }, p.x, p.y, 0);
      }
      return;
    }
    for (const b of M.Composite.allBodies(g.mundo.engine.world)) {
      const p = b.plugin;
      if (!p || !p.k) continue;
      if (p.k === 'porco') drawPorco(b.position.x, b.position.y, p.r, b.angle, p.tipo);
      else drawPeca(p, b.position.x, b.position.y, b.angle);
    }
    if (g.bola) drawBola(g.bola.position.x, g.bola.position.y, g.bola.angle);
    for (const f of g.fx) {
      if (f.k === 'puf') {
        ctx.globalAlpha = 1 - f.t; ctx.fillStyle = '#fbf7ee'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const an = i * 1.05, d = 8 + f.t * 26;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 6 * (1 - f.t) + 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (f.k === 'creme') {
        ctx.globalAlpha = 1 - f.t; ctx.fillStyle = '#fff3c4'; ctx.strokeStyle = '#e0b85a'; ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const an = i * 0.63, d = f.t * CREME_KO;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 9 * (1 - f.t) + 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawMira() {
    const pull = g.pull || (g.kb.on ? pullDoTeclado() : null);
    if (!pull || (mode !== 'pronto' && mode !== 'mira')) return null;
    const v = velocidade(pull);
    const gstep = M ? g.mundo.engine.gravity.y * g.mundo.engine.gravity.scale * STEP * STEP : 0.2778;
    let x = HAND.x, y = HAND.y, vx = v.x, vy = v.y;
    ctx.fillStyle = INK;
    for (let i = 1; i <= 45; i++) {
      vy += gstep; vx *= 0.998; vy *= 0.998; x += vx; y += vy;
      if (y > GROUND) break;
      if (i % 3 === 0) { ctx.globalAlpha = 1 - i / 50; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // a mão puxa para trás, até metade do puxão
    const len = Math.hypot(pull.x, pull.y), k = Math.min(len, MAX_PULL) / (len || 1) * 0.25;
    return { x: -pull.x * k, y: -pull.y * k };
  }

  function draw() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawPraia();
    drawMundo();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let aim = null;
    if (g && g.mundo) aim = drawMira();
    drawInes(aim);
    if (g && (mode === 'pronto' || mode === 'mira') && g.bolas > 0) {
      drawBola(HAND.x + (aim ? aim.x : 0), HAND.y + (aim ? aim.y : 0));
    }
    if (!g) {
      outlined(carga === 'a' ? 'A carregar a praia…' : carga === 'erro' ? 'Sem rede. Toca outra vez' : 'Toca para jogar!', W / 2, 150, 26);
      ctx.font = '600 14px Archivo, system-ui, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText(`O teu recorde: ${best} pontos`, W / 2, 176);
      return;
    }
    // marcador: nível, bolas que faltam, pontos
    ctx.fillStyle = 'rgba(18,17,16,.72)'; rr(8, 8, 150, 26, 8); ctx.fill();
    ctx.font = '700 12px Archivo, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#f6efe0';
    ctx.fillText(`NÍVEL ${g.nivel + 1}/${NIVEIS.length}`, 16, 26);
    for (let i = 0; i < Math.min(g.bolas, 6); i++) { ctx.save(); ctx.translate(96 + i * 11, 21); ctx.scale(0.45, 0.45); drawBola(0, 0); ctx.restore(); }
    ctx.textAlign = 'right';
    outlined(String(g.score), W - 14, 32, 24);
    ctx.textAlign = 'center';
    if (mode === 'pronto' && !g.kb.on) {
      ctx.font = '700 12px Archivo, system-ui, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText('Arrasta a bola para trás e larga', W / 2, H - 14);
    } else if (mode === 'voo' && !g.creme) {
      ctx.font = '700 12px Archivo, system-ui, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText('Toca para rebentar a bola em creme!', W / 2, H - 14);
    }
    for (const tx of g.texts) {
      ctx.globalAlpha = Math.min(1, tx.life * 1.5);
      outlined(tx.text, tx.x, tx.y, tx.size, tx.color);
      ctx.globalAlpha = 1;
    }
    if (suspensa) {
      ctx.fillStyle = 'rgba(18,17,16,.55)'; ctx.fillRect(0, 0, W, H);
      outlined('Toca para continuar', W / 2, H / 2, 26);
    }
  }

  function loop(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0);
    last = ts;
    if (g && jogando() && !suspensa) {
      acc += dt * 1000;
      let n = 0;
      while (acc >= STEP && n < 4) { passo(); acc -= STEP; n++; }
      if (n === 4) acc = 0;
    } else acc = 0;
    draw();
    raf = requestAnimationFrame(loop);
  }
  // só anima quando está à vista; a física fica em pausa fora do ecrã (e só carrega quando aparece)
  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    cancelAnimationFrame(raf);
    if (e.isIntersecting) { carregarMatter().then((m) => { M = m; }).catch(() => {}); last = performance.now(); raf = requestAnimationFrame(loop); }
    else if (jogando()) {
      suspensa = true;
      if (mode === 'mira') { drag = null; g.pull = null; setMode('pronto'); }
      canvas.parentElement.classList.remove('playing');
      draw();
    }
  }, { threshold: 0.2 });
  io.observe(canvas);

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  // A mira só começa com o dedo perto da bola: deslizar noutro sítio do jogo faz scroll (touch-action: pan-y)
  // e não gasta bolas. Com a bola no ar, o creme é um toque curto (um deslizar não conta).
  const pertoDaBola = (p) => Math.hypot(p.x - HAND.x, p.y - HAND.y) < 80;
  canvas.addEventListener('touchstart', (e) => {
    // a mira a sério: aqui o browser não pode transformar o gesto em scroll
    if (mode === 'pronto' && !suspensa && pertoDaBola(toCanvas(e.touches[0]))) e.preventDefault();
  }, { passive: false });
  let toque = null; // toque curto com a bola no ar
  canvas.addEventListener('pointerdown', (e) => {
    if (!jogando() || suspensa) return;
    if (mode === 'voo') { toque = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    if (mode !== 'pronto' || drag) return;
    const p = toCanvas(e);
    if (!pertoDaBola(p)) return;
    e.preventDefault();
    drag = { ...p, id: e.pointerId };
    g.kb.on = false;
    canvas.setPointerCapture?.(e.pointerId);
    g.pull = { x: 0, y: 0 };
    setMode('mira');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'mira' || !drag || e.pointerId !== drag.id) return;
    const p = toCanvas(e);
    g.pull = { x: drag.x - p.x, y: drag.y - p.y };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (toque && e.pointerId === toque.id) {
      const curto = Math.hypot(e.clientX - toque.x, e.clientY - toque.y) < 12;
      toque = null;
      if (curto && mode === 'voo') creme();
      return;
    }
    if (mode !== 'mira' || !drag || e.pointerId !== drag.id) return;
    const pull = g.pull; drag = null;
    if (!pull || Math.hypot(pull.x, pull.y) < 14) { g.pull = null; setMode('pronto'); return; } // foi só um toque
    atirar(pull);
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (toque && e.pointerId === toque.id) toque = null;
    if (mode === 'mira' && drag && e.pointerId === drag.id) { drag = null; g.pull = null; setMode('pronto'); }
  });
  canvas.addEventListener('click', () => { if (mode === 'intro') start(); else if (suspensa) retomar(); });
  // teclado: ↑↓ ângulo, ←→ força, Espaço atira e, no ar, rebenta em creme
  document.addEventListener('keydown', (e) => {
    const keys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.code)) return;
    if (e.target.closest('input, textarea, button, a, dialog')) return;
    const r = canvas.getBoundingClientRect();
    const aVista = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= r.height * 0.6; // o jogo tem de estar à vista
    if (suspensa) { if (aVista && e.code === 'Space' && !e.repeat) { e.preventDefault(); retomar(); } return; }
    if (jogando()) {
      if (!aVista) return;
      e.preventDefault();
      if (mode === 'pronto') {
        if (e.code === 'Space') { if (!e.repeat) atirar(pullDoTeclado()); return; }
        g.kb.on = true;
        if (e.code === 'ArrowUp') g.kb.ang = Math.min(85, g.kb.ang + 2);
        if (e.code === 'ArrowDown') g.kb.ang = Math.max(-10, g.kb.ang - 2);
        if (e.code === 'ArrowRight') g.kb.pow = Math.min(1, g.kb.pow + 0.03);
        if (e.code === 'ArrowLeft') g.kb.pow = Math.max(0.2, g.kb.pow - 0.03);
      } else if (mode === 'voo' && e.code === 'Space' && !e.repeat) creme();
      return;
    }
    if (mode !== 'intro' || e.code !== 'Space' || e.repeat || !aVista) return;
    e.preventDefault();
    start();
  });
  ui.again.addEventListener('click', () => { ui.again.blur(); start(); });

  placar.render();
  draw();
}
