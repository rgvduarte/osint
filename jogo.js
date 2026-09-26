// O voo do noivo: minijogo tipo Flappy Bird com a cara do Ricardo (foto antiga, mascarado)
// a desviar-se de garrafas-paródia, com power-ups de casamento e um leaderboard.
import { TEXTOS } from './jogo-textos.js';
import { criarPlacar, ligarSubmissao, mostrarPainel, calmo, load, save } from './placar.js';

const W = 360, H = 540;              // coordenadas lógicas do canvas
const GRAVITY = 1500, FLAP = -430;   // px/s², px/s
const R = 21;                        // raio da cabeça
const BOTTLE_W = 58, NECK_W = 22, NECK_H = 46;
const LB_KEY = 'xinxers-voo-local', BEST_KEY = 'xinxers-voo-recorde';

const PALETTE = {
  whisky: { body: '#b8732a', glass: '#8a4f14', label: '#161412', ink: '#f2e3c2', shape: 'square' },
  vodka: { body: '#d9eef5', glass: '#9fc6d6', label: '#f7f7f7', ink: '#1b3a8a', shape: 'tall' },
  champanhe: { body: '#1f4d2e', glass: '#123520', label: '#f1e2b4', ink: '#5a3d0a', shape: 'round', foil: '#d9b44a' },
  cerveja: { body: '#6a3b12', glass: '#4a280a', label: '#f5c542', ink: '#8a1c12', shape: 'tall' },
  tequila: { body: '#e8e2c8', glass: '#b9b08a', label: '#2a7a3b', ink: '#fff6d8', shape: 'square' },
  porto: { body: '#3a0d18', glass: '#240710', label: '#efe3c8', ink: '#5a0d1c', shape: 'round' },
  licor: { body: '#7a4a14', glass: '#56320b', label: '#d8322a', ink: '#fff2c8', shape: 'square' },
  gin: { body: '#2f7f8a', glass: '#1c5a63', label: '#f2f0e6', ink: '#1c3f63', shape: 'square' },
  rum: { body: '#4a2a12', glass: '#301a09', label: '#c9302a', ink: '#fbe7c2', shape: 'round' },
  vinho: { body: '#26452a', glass: '#182f1c', label: '#f3ead6', ink: '#6b1020', shape: 'round' },
};
const POWER = {
  alianca: { emoji: '💍', dur: 5, efeito: '5 s invencível' },
  agua: { emoji: '🥛', dur: 5, efeito: 'câmara lenta' },
  bolo: { emoji: '🎂', dur: 0, efeito: '+5 pontos' },
  ramo: { emoji: '💐', dur: 8, efeito: 'pontos a dobrar' },
  flash: { emoji: '📸', dur: 0, efeito: 'limpa as garrafas' },
};

export function initJogo(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    over: root.querySelector('[data-over]'),
    overTitle: root.querySelector('[data-over-title]'),
    overText: root.querySelector('[data-over-text]'),
    name: root.querySelector('[data-name]'),
    submit: root.querySelector('[data-submit]'),
    again: root.querySelector('[data-again]'),
    board: root.querySelector('[data-board]'),
    boardNote: root.querySelector('[data-board-note]'),
  };
  const face = new Image();
  face.src = 'assets/noivo-cara.jpg';

  for (const el of root.querySelectorAll('[data-t]')) el.textContent = TEXTOS[el.dataset.t];
  root.querySelector('[data-powers]')?.replaceChildren(...TEXTOS.powerups.map((p) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="pw-emoji" aria-hidden="true"></span><b></b><span></span>';
    li.children[0].textContent = POWER[p.id].emoji;
    li.children[1].textContent = p.nome;
    li.children[2].textContent = POWER[p.id].efeito;
    return li;
  }));

  let dpr = 1;
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * (H / W) * dpr);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  let g = null;       // estado da partida
  let mode = 'intro'; // intro | playing | over
  const setMode = (m) => { mode = m; canvas.parentElement.classList.toggle('playing', m === 'playing'); };
  let raf = 0, last = 0;
  let best = load(BEST_KEY, 0);
  const placar = criarPlacar({ path: 'voo', localKey: LB_KEY, board: ui.board, note: ui.boardNote });
  const resetPainel = ligarSubmissao(ui, placar, () => (mode === 'over' ? g : null));

  function newGame() {
    g = {
      y: H * 0.42, vy: 0, t: 0, score: 0, spin: 0,
      pairs: [], items: [], texts: [], spawnIn: 0.2,
      shield: 0, slow: 0, double: 0, flash: 0,
      killer: null, submitted: false,
    };
  }

  function flap() {
    if (mode === 'intro') { newGame(); setMode('playing'); ui.over.hidden = true; }
    if (mode !== 'playing') return;
    g.vy = FLAP;
    g.spin = 1;
  }

  function difficulty() {
    const s = g.score;
    return {
      speed: Math.min(235, 150 + s * 3.2),
      gap: Math.max(118, 158 - s * 1.6),
      every: Math.max(1.15, 1.55 - s * 0.012),
    };
  }

  function spawn() {
    const d = difficulty();
    const gapY = 110 + Math.random() * (H - 220);
    const pick = () => TEXTOS.garrafas[Math.floor(Math.random() * TEXTOS.garrafas.length)];
    const top = pick(), bottom = pick();
    g.pairs.push({ x: W + BOTTLE_W, gapY, gap: d.gap, top, bottom, passed: false });
    if (Math.random() < 0.34) {
      const ids = Object.keys(POWER);
      const id = ids[Math.floor(Math.random() * ids.length)];
      g.items.push({ id, x: W + BOTTLE_W + 110, y: gapY + (Math.random() - 0.5) * d.gap * 0.4, bob: Math.random() * 6 });
    }
    g.spawnIn = d.every;
  }

  function say(text, color = '#f5c542') {
    g.texts.push({ text, x: W / 2, y: H * 0.3, life: 1.4, color });
  }

  function takePower(id) {
    const p = TEXTOS.powerups.find((q) => q.id === id);
    if (p) say(p.grito);
    if (id === 'alianca') g.shield = POWER.alianca.dur;
    if (id === 'agua') g.slow = POWER.agua.dur;
    if (id === 'ramo') g.double = POWER.ramo.dur;
    if (id === 'bolo') g.score += 5;
    if (id === 'flash') { g.flash = 0.35; g.pairs = g.pairs.filter((q) => q.x > W + 10); }
  }

  // retângulos de colisão de um par (corpo + gargalo de cada garrafa)
  function rects(q) {
    const top = q.gapY - q.gap / 2, bot = q.gapY + q.gap / 2;
    const cx = q.x + BOTTLE_W / 2;
    return [
      { x: q.x, y: -20, w: BOTTLE_W, h: top - NECK_H + 20 },
      { x: cx - NECK_W / 2, y: top - NECK_H, w: NECK_W, h: NECK_H },
      { x: cx - NECK_W / 2, y: bot, w: NECK_W, h: NECK_H },
      { x: q.x, y: bot + NECK_H, w: BOTTLE_W, h: H - bot - NECK_H + 20 },
    ];
  }
  const hit = (r, x, y, rad) => {
    const nx = Math.max(r.x, Math.min(x, r.x + r.w)), ny = Math.max(r.y, Math.min(y, r.y + r.h));
    return (x - nx) ** 2 + (y - ny) ** 2 < rad * rad;
  };

  function update(dt) {
    const time = g.slow > 0 ? 0.55 : 1;
    const d = difficulty();
    const sdt = dt * time;
    g.t += dt;
    g.vy += GRAVITY * sdt;
    g.y += g.vy * sdt;
    g.spin = Math.max(0, g.spin - dt * 1.5);
    for (const k of ['shield', 'slow', 'double', 'flash']) g[k] = Math.max(0, g[k] - dt);
    g.spawnIn -= sdt;
    if (g.spawnIn <= 0) spawn();
    for (const q of g.pairs) {
      q.x -= d.speed * sdt;
      if (!q.passed && q.x + BOTTLE_W < 90 - R) { q.passed = true; g.score += g.double > 0 ? 2 : 1; }
    }
    g.pairs = g.pairs.filter((q) => q.x > -BOTTLE_W - 10);
    for (const it of g.items) { it.x -= d.speed * sdt; it.bob += dt * 4; }
    g.items = g.items.filter((it) => {
      if (it.x < -30) return false;
      if ((it.x - 90) ** 2 + (it.y + Math.sin(it.bob) * 6 - g.y) ** 2 < (R + 16) ** 2) { takePower(it.id); return false; }
      return true;
    });
    for (const tx of g.texts) { tx.life -= dt; tx.y -= dt * 30; }
    g.texts = g.texts.filter((tx) => tx.life > 0);

    // colisões: chão/teto e garrafas (a aliança protege das garrafas)
    if (g.y > H - R || g.y < R) {
      if (g.shield > 0) { g.y = Math.max(R, Math.min(H - R, g.y)); g.vy = g.y < H / 2 ? 50 : -300; }
      else return die(null);
    }
    if (g.shield <= 0) {
      for (const q of g.pairs) {
        if (q.x > 90 + R || q.x + BOTTLE_W < 90 - R) continue;
        const rs = rects(q);
        if (rs.slice(0, 2).some((r) => hit(r, 90, g.y, R - 3))) return die(q.top);
        if (rs.slice(2).some((r) => hit(r, 90, g.y, R - 3))) return die(q.bottom);
      }
    }
  }

  function die(bottle, fugiu = false) {
    setMode('over');
    g.killer = bottle;
    const newBest = g.score > best;
    if (newBest) { best = g.score; save(BEST_KEY, best); }
    ui.overTitle.textContent = `${g.score} ponto${g.score === 1 ? '' : 's'}`;
    ui.overText.textContent = bottle ? bottle.derrota
      : fugiu ? 'Deixaste o noivo a voar sozinho. Ele caiu, claro.'
      : g.y > H / 2 ? 'O noivo aterrou na pista de dança. De cara.' : 'O noivo foi ao teto. Literalmente.';
    if (newBest && g.score > 0) ui.overText.textContent += ' ' + TEXTOS.recorde_frases[Math.floor(Math.random() * TEXTOS.recorde_frases.length)];
    resetPainel(g.score > 0);
    mostrarPainel(ui);
    placar.render(); // entretanto, outros convidados podem ter jogado
  }

  // ---- desenho
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // garrafa com o gargalo em (cx, tipY), a apontar para cima (dir = −1) ou para baixo (dir = 1)
  function drawBottle(b, cx, tipY, dir, length) {
    const p = PALETTE[b.tipo] || PALETTE.whisky;
    ctx.save();
    ctx.translate(cx, tipY);
    if (dir === 1) ctx.scale(1, -1);
    // gargalo e ombro
    const shoulder = p.shape === 'square' ? 8 : p.shape === 'round' ? 22 : 14;
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a1f17';
    ctx.fillStyle = p.body;
    ctx.beginPath();
    ctx.moveTo(-NECK_W / 2, 0);
    ctx.lineTo(-NECK_W / 2, NECK_H - shoulder * 0.3);
    ctx.quadraticCurveTo(-BOTTLE_W / 2, NECK_H, -BOTTLE_W / 2, NECK_H + shoulder);
    ctx.lineTo(-BOTTLE_W / 2, length);
    ctx.lineTo(BOTTLE_W / 2, length);
    ctx.lineTo(BOTTLE_W / 2, NECK_H + shoulder);
    ctx.quadraticCurveTo(BOTTLE_W / 2, NECK_H, NECK_W / 2, NECK_H - shoulder * 0.3);
    ctx.lineTo(NECK_W / 2, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // reflexo do vidro
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(-BOTTLE_W / 2 + 7, NECK_H + shoulder + 6, 6, Math.max(0, length - NECK_H - shoulder - 12));
    // tampa / papel dourado
    ctx.fillStyle = p.foil || p.glass;
    ctx.fillRect(-NECK_W / 2 - 2, 0, NECK_W + 4, 12);
    ctx.strokeRect(-NECK_W / 2 - 2, 0, NECK_W + 4, 12);
    // rótulo com o nome (sempre legível, mesmo nas garrafas de cima)
    const ly = NECK_H + shoulder + 24;
    if (length - 20 > ly + 58) { // só se o rótulo couber inteiro no ecrã
      ctx.fillStyle = p.label;
      ctx.fillRect(-BOTTLE_W / 2 + 4, ly, BOTTLE_W - 8, 56);
      ctx.strokeRect(-BOTTLE_W / 2 + 4, ly, BOTTLE_W - 8, 56);
      ctx.save();
      ctx.translate(0, ly + 28);
      if (dir === 1) ctx.scale(1, -1);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitFont(b.nome, 13, 52);
      ctx.fillText(b.nome, 0, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHead(x, y, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // escudo da aliança
    if (g && g.shield > 0) {
      ctx.strokeStyle = `rgba(245,197,66,${0.5 + 0.5 * Math.sin(g.t * 12)})`;
      ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R + 9, 0, Math.PI * 2); ctx.stroke();
    }
    // chapéu com hélice
    ctx.fillStyle = '#8b8e93'; ctx.strokeStyle = '#2a1f17'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, -R + 2, R + 6, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R + 6, -R + 1); ctx.quadraticCurveTo(-R + 6, -R - 14, 0, -R - 14); ctx.quadraticCurveTo(R - 6, -R - 14, R - 6, -R + 1); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -R - 14); ctx.lineTo(0, -R - 22); ctx.stroke();
    const blade = Math.cos((g ? g.t : 0) * (10 + (g ? g.spin : 0) * 40));
    ctx.fillStyle = '#d8322a';
    ctx.beginPath(); ctx.ellipse(0, -R - 23, 16 * Math.abs(blade) + 2, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // cara
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip();
    if (face.complete && face.naturalWidth) ctx.drawImage(face, -R - 4, -R - 4, (R + 4) * 2, (R + 4) * 2);
    else { ctx.fillStyle = '#e8c9a0'; ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a1f17'; ctx.stroke();
    ctx.restore();
  }

  // fonte de desenho animado, encolhida até o texto caber na largura
  function fitFont(text, size, max) {
    do ctx.font = `400 ${size}px "Luckiest Guy", "Arial Black", sans-serif`;
    while (ctx.measureText(text).width > max && --size > 9);
  }

  function draw() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    // céu de fim de tarde e pátio
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#f6d9a6'); sky.addColorStop(1, '#f1e4c6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const off = ((g ? g.t : 0) * 20) % 60;
    ctx.fillStyle = 'rgba(42,31,23,.06)';
    for (let x = -off; x < W; x += 60) ctx.fillRect(x, 0, 30, H);
    ctx.fillStyle = '#e7cf99'; ctx.fillRect(0, H - 14, W, 14);
    ctx.fillStyle = '#2a1f17'; ctx.fillRect(0, H - 14, W, 3);

    if (g) {
      for (const q of g.pairs) {
        const cx = q.x + BOTTLE_W / 2;
        drawBottle(q.top, cx, q.gapY - q.gap / 2, 1, q.gapY - q.gap / 2 + 20);
        drawBottle(q.bottom, cx, q.gapY + q.gap / 2, -1, H - (q.gapY + q.gap / 2) + 20);
      }
      for (const it of g.items) {
        const y = it.y + Math.sin(it.bob) * 6;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a1f17'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(it.x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = '20px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(POWER[it.id].emoji, it.x, y + 1);
      }
    }
    const y = g ? g.y : H * 0.42 + (calmo() ? 0 : Math.sin(performance.now() / 300) * 8);
    const tilt = g ? Math.max(-0.5, Math.min(1.1, g.vy / 700)) : 0;
    drawHead(90, y, tilt);

    // pontuação e efeitos ativos
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (mode !== 'intro') {
      ctx.font = '400 44px "Luckiest Guy", "Arial Black", sans-serif';
      ctx.lineWidth = 7; ctx.strokeStyle = '#2a1f17'; ctx.strokeText(String(g.score), W / 2, 64);
      ctx.fillStyle = '#f5c542'; ctx.fillText(String(g.score), W / 2, 64);
      const fx = [['shield', '💍'], ['slow', '🥛'], ['double', '💐']].filter(([k]) => g[k] > 0);
      ctx.font = '600 13px Archivo, system-ui, sans-serif'; ctx.textAlign = 'left';
      fx.forEach(([k, e], i) => { ctx.fillStyle = '#2a1f17'; ctx.fillText(`${e} ${g[k].toFixed(1)}s`, 10, 22 + i * 18); });
      for (const tx of g.texts) {
        ctx.globalAlpha = Math.min(1, tx.life * 1.5);
        ctx.textAlign = 'center';
        fitFont(tx.text, 22, W - 28);
        ctx.lineWidth = 5; ctx.strokeStyle = '#2a1f17'; ctx.strokeText(tx.text, tx.x, tx.y);
        ctx.fillStyle = tx.color; ctx.fillText(tx.text, tx.x, tx.y);
        ctx.globalAlpha = 1;
      }
      if (g.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${g.flash / 0.35})`; ctx.fillRect(0, 0, W, H); }
    } else {
      ctx.font = '400 26px "Luckiest Guy", "Arial Black", sans-serif';
      ctx.lineWidth = 6; ctx.strokeStyle = '#2a1f17';
      ctx.strokeText('Toca para voar!', W / 2, H * 0.68); ctx.fillStyle = '#f5c542'; ctx.fillText('Toca para voar!', W / 2, H * 0.68);
      ctx.font = '600 14px Archivo, system-ui, sans-serif'; ctx.fillStyle = '#2a1f17';
      ctx.fillText(`O teu recorde: ${best}`, W / 2, H * 0.68 + 28);
    }
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0);
    last = ts;
    if (mode === 'playing') update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }
  // só anima quando o jogo está visível
  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    cancelAnimationFrame(raf);
    if (e.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(loop); }
    else if (mode === 'playing') die(null, true);
  }, { threshold: 0.2 });
  io.observe(canvas);

  // a jogar, o toque é imediato; antes, só um toque "limpo" começa (deslizar para fazer scroll não conta)
  canvas.addEventListener('pointerdown', (e) => { if (mode === 'playing') { e.preventDefault(); flap(); } });
  canvas.addEventListener('click', () => { if (mode === 'intro') flap(); });
  document.addEventListener('keydown', (e) => {
    if (!(e.code === 'Space' || e.code === 'ArrowUp')) return;
    if (e.target.closest('input, textarea, button, a, dialog')) return;
    if (mode === 'playing') { e.preventDefault(); if (!e.repeat) flap(); return; }
    if (mode !== 'intro' || e.repeat) return;
    const r = canvas.getBoundingClientRect();
    if (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < r.height * 0.6) return; // o jogo tem de estar à vista
    e.preventDefault();
    flap();
  });
  ui.again.addEventListener('click', () => { ui.again.blur(); newGame(); setMode('playing'); ui.over.hidden = true; });

  placar.render();
  draw();
}
