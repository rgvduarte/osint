// Dardos do sofá: o dardo é a cabeça do inspector, o alvo é a folga entre as duas almofadas das
// costas do sofá. Baseado numa noite em que o inspector bebeu uma garrafa de Jaque Daniels, aterrou
// de cabeça na folga e se deixou lá ficar. 3 rondas de 3 cabeçadas; em cada ronda a mira fica mais tonta.
import { TEXTOS } from './sofa-textos.js';
import { criarPlacar, ligarSubmissao, mostrarPainel, calmo, load, save } from './placar.js';

const W = 360, H = 540;              // coordenadas lógicas do canvas
const RONDAS = 3, CABECAS = 3;
const GAP_X = 180;                   // a folga entre as almofadas das costas
const BACK = { x0: 42, x1: 318, y0: 118, y1: 318 };  // almofadas das costas
const SEAT = { x0: 42, x1: 318, y0: 318, y1: 385 };  // almofadas do assento
const ARM_Y = 244, ARM_X0 = 50, ARM_X1 = W - 50;     // braços do sofá (de ARM_Y para baixo)
const HEAD_R = 25, FLIGHT = 0.5;     // raio da cabeça espetada, duração do voo (s)
const ZONAS = {
  encaixe: { pts: 50, emoji: '🎯', txt: 'na folga' },
  quase: { pts: 25, emoji: '😵', txt: 'mesmo ao lado da folga' },
  almofada: { pts: 10, emoji: '🛋️', txt: 'resto das almofadas das costas' },
  assento: { pts: 2, emoji: '💺', txt: 'almofadas do assento' },
  fora: { pts: 0, emoji: '🧱', txt: 'braço, parede, chão' },
};
// quanto a mira baloiça em cada ronda: velocidade e solavancos (px)
const TONTURA = [{ v: 1, s: 0 }, { v: 1.35, s: 10 }, { v: 1.75, s: 22 }];
const LB_KEY = 'xinxers-sofa-local', BEST_KEY = 'xinxers-sofa-recorde';
const INK = '#2a1f17';
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function zonaDe(x, y) {
  const d = Math.abs(x - GAP_X);
  // as almofadas do assento são desenhadas por cima dos braços; os braços, por cima das almofadas das costas
  if (x >= SEAT.x0 && x <= SEAT.x1 && y >= SEAT.y0 && y < SEAT.y1) return 'assento';
  if (y >= ARM_Y && (x <= ARM_X0 || x >= ARM_X1)) return 'fora';
  if (x >= BACK.x0 && x <= BACK.x1 && y >= BACK.y0 && y < BACK.y1) {
    if (d <= 10 && y >= BACK.y0 + 12 && y <= BACK.y1 - 8) return 'encaixe';
    if (d <= 24) return 'quase';
    return 'almofada';
  }
  return 'fora';
}

export function initSofa(root) {
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
  const face = new Image();
  face.src = 'assets/inspector-cara.jpg';

  for (const el of root.querySelectorAll('[data-t]')) el.textContent = TEXTOS[el.dataset.t];
  root.querySelector('[data-powers]')?.replaceChildren(...Object.entries(ZONAS).map(([, z]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="pw-emoji" aria-hidden="true"></span><b></b><span></span>';
    li.children[0].textContent = z.emoji;
    li.children[1].textContent = `${z.pts} pontos`;
    li.children[2].textContent = z.txt;
    return li;
  }));

  function resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * (H / W) * dpr);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  let g = null;
  // intro | mira-x | mira-y | voo (a cabeça no ar) | pausa (entre cabeçadas/rondas) | over
  let mode = 'intro';
  const jogando = () => mode !== 'intro' && mode !== 'over';
  const setMode = (m) => { mode = m; canvas.parentElement.classList.toggle('playing', jogando()); };
  let raf = 0, last = 0;
  const intro = { t: 0 };
  let best = load(BEST_KEY, 0);
  const placar = criarPlacar({ path: 'sofa', localKey: LB_KEY, board: ui.board, note: ui.boardNote });
  const resetPainel = ligarSubmissao(ui, placar, () => (mode === 'over' ? g : null));

  function newGame() {
    g = {
      t: 0, score: 0, ronda: 0, cabeca: 0, submitted: false,
      aimT: 0, phase: Math.random() * 6, aim: { x: GAP_X, y: 220 },
      heads: [], hist: [], flight: null, texts: [], wait: 0, banner: 0,
    };
    novaRonda(0);
  }

  function novaRonda(r) {
    g.ronda = r; g.cabeca = 0; g.heads = [];
    g.banner = 1.8;
    const R = TEXTOS.rondas[r];
    say(R.nome, '#f5c542', H * 0.22, 1.8);
    say(R.frase, '#f6efe0', H * 0.22 + 30, 1.8, 16);
    setMode('pausa'); g.wait = 1.2;
  }

  function say(text, color = '#f5c542', y = H * 0.3, life = 1.4, size = 22) {
    g.texts.push({ text, x: W / 2, y, life, color, size });
  }

  function start() {
    newGame();
    ui.over.hidden = true;
  }

  // posição da mira: baloiça, mais depressa e aos solavancos em cada ronda
  function mira(axis) {
    const T = TONTURA[g.ronda], t = g.aimT;
    const noise = T.s * (Math.sin(5.3 * t + g.phase) + Math.sin(7.9 * t + 1.7 * g.phase)) / 2;
    if (axis === 'x') return GAP_X + 160 * Math.sin(1.5 * T.v * t + g.phase) + noise;
    return 280 + 190 * Math.sin(1.8 * T.v * t + g.phase * 0.7) + noise;
  }

  // um toque: fixa a mira na horizontal, depois na vertical, e a cabeça voa
  function tap() {
    if (mode === 'mira-x') {
      g.aim.x = Math.max(4, Math.min(W - 4, mira('x')));
      g.aimT = 0; g.phase = Math.random() * 6;
      setMode('mira-y');
    } else if (mode === 'mira-y') {
      g.aim.y = Math.max(40, Math.min(H - 20, mira('y')));
      g.flight = { x: g.aim.x, y: g.aim.y, t: 0, spin: (Math.random() < 0.5 ? -1 : 1) * 9 };
      setMode('voo');
    }
  }

  function aterrar() {
    const { x, y } = g.flight;
    const zona = zonaDe(x, y);
    g.flight = null;
    g.heads.push({ x, y, zona, t: 0 });
    g.hist.push(zona);
    g.score += ZONAS[zona].pts;
    g.cabeca += 1;
    say(`${pick(TEXTOS.gritos[zona])} +${ZONAS[zona].pts}`, zona === 'encaixe' ? '#f5c542' : zona === 'fora' ? '#f6efe0' : '#f3c8a0', H * 0.12);
    setMode('pausa');
    g.wait = zona === 'encaixe' ? 1.6 : 1.1;
  }

  function seguinte() {
    if (g.cabeca < CABECAS) { g.aimT = 0; g.phase = Math.random() * 6; setMode('mira-x'); return; }
    if (g.ronda + 1 < RONDAS) return novaRonda(g.ronda + 1);
    fim();
  }

  function fim() {
    setMode('over');
    const newBest = g.score > best;
    if (newBest) { best = g.score; save(BEST_KEY, best); }
    const encaixes = g.hist.filter((z) => z === 'encaixe').length;
    ui.overTitle.textContent = `${g.score} ponto${g.score === 1 ? '' : 's'}`;
    ui.overText.textContent = `${encaixes} encaixe${encaixes === 1 ? '' : 's'} em ${RONDAS * CABECAS} cabeçadas.`;
    if (newBest && g.score > 0) ui.overText.textContent += ' ' + pick(TEXTOS.recorde_frases);
    const v = [...TEXTOS.veredictos].sort((a, b) => a.min - b.min).filter((q) => g.score >= q.min).pop();
    ui.verdict.textContent = v ? v.texto : '';
    resetPainel(g.score > 0);
    mostrarPainel(ui);
    placar.render();
  }

  function update(dt) {
    g.t += dt;
    for (const tx of g.texts) { tx.life -= dt; tx.y -= dt * 18; }
    g.texts = g.texts.filter((tx) => tx.life > 0);
    for (const h of g.heads) h.t += dt;
    g.banner = Math.max(0, g.banner - dt);
    if (mode === 'mira-x' || mode === 'mira-y') g.aimT += dt;
    else if (mode === 'voo') { g.flight.t += dt; if (g.flight.t >= FLIGHT) aterrar(); }
    else if (mode === 'pausa' && (g.wait -= dt) <= 0) seguinte();
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

  function drawRoom() {
    // janela e peitoril
    ctx.fillStyle = '#c9d6dc'; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 26, W, 14);
    ctx.fillStyle = INK; ctx.fillRect(0, 40, W, 2);
    // faixa de azulejos
    for (let x = 0; x < W; x += 30) {
      ctx.fillStyle = '#f3ead2'; ctx.fillRect(x, 42, 30, 34);
      ctx.fillStyle = '#2f5d9e';
      ctx.beginPath(); ctx.moveTo(x + 15, 46); ctx.lineTo(x + 26, 59); ctx.lineTo(x + 15, 72); ctx.lineTo(x + 4, 59); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e0a93b'; ctx.beginPath(); ctx.arc(x + 15, 59, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(42,31,23,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, 42.5, 30, 34);
    }
    ctx.fillStyle = INK; ctx.fillRect(0, 76, W, 2);
    // parede de azulejo claro
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(0, 78, W, 400);
    ctx.strokeStyle = 'rgba(42,31,23,.07)'; ctx.lineWidth = 1;
    for (let y = 78; y < 470; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // chão de tijoleira com a passadeira de azulejo
    ctx.fillStyle = '#b86a33'; ctx.fillRect(0, 462, W, H - 462);
    ctx.strokeStyle = 'rgba(42,31,23,.25)';
    for (let x = -40; x < W + 40; x += 48) { ctx.beginPath(); ctx.moveTo(x, 462); ctx.lineTo(x - 30, H); ctx.stroke(); }
    ctx.fillStyle = '#2f5d9e';
    ctx.beginPath(); ctx.moveTo(200, H); ctx.lineTo(250, 462); ctx.lineTo(282, 462); ctx.lineTo(232, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0a93b';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(246 - i * 10.5, 474 + i * 20, 3.5, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawSofa(sway) {
    ctx.save();
    ctx.translate(W / 2, 400); ctx.rotate(sway); ctx.translate(-W / 2, -400);
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    // almofadas das costas (duas, a folga ao meio)
    const cream = '#e9e2d2', creamDark = '#d6cdb9';
    for (const [x0, x1] of [[BACK.x0 - 6, GAP_X - 1], [GAP_X + 1, BACK.x1 + 6]]) {
      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, x0 < GAP_X ? creamDark : cream); grad.addColorStop(0.5, cream); grad.addColorStop(1, x0 < GAP_X ? cream : creamDark);
      ctx.fillStyle = grad;
      rr(x0, BACK.y0, x1 - x0, BACK.y1 - BACK.y0 + 10, 18); ctx.fill(); ctx.stroke();
    }
    // a folga: sombra funda entre as almofadas
    const gap = ctx.createLinearGradient(GAP_X - 9, 0, GAP_X + 9, 0);
    gap.addColorStop(0, 'rgba(42,31,23,0)'); gap.addColorStop(0.5, 'rgba(42,31,23,.55)'); gap.addColorStop(1, 'rgba(42,31,23,0)');
    ctx.fillStyle = gap; ctx.fillRect(GAP_X - 9, BACK.y0 + 6, 18, BACK.y1 - BACK.y0 - 4);
    // almofadas soltas, creme com a faixa de pele preta
    for (const [x, y, w, h, rot] of [[62, 196, 92, 88, -0.05], [206, 190, 92, 88, 0.06]]) {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
      rr(-w / 2, -h / 2, w, h, 12); ctx.fillStyle = '#ece6d8'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#231c1a'; ctx.fillRect(-w / 2, h * 0.12, w, h); ctx.restore();
      rr(-w / 2, -h / 2, w, h, 12); ctx.stroke();
      ctx.restore();
    }
    // braços e base de pele escura
    ctx.fillStyle = '#3a2721';
    rr(8, ARM_Y, ARM_X0 - 8, 222, 16); ctx.fill(); ctx.stroke();
    rr(ARM_X1, ARM_Y, W - 8 - ARM_X1, 222, 16); ctx.fill(); ctx.stroke();
    ctx.fillRect(40, SEAT.y1 - 4, W - 80, 80); ctx.strokeRect(40, SEAT.y1 - 4, W - 80, 80);
    // almofadas do assento
    for (const [x0, x1] of [[SEAT.x0, GAP_X], [GAP_X, SEAT.x1]]) {
      ctx.fillStyle = cream; rr(x0, SEAT.y0, x1 - x0, SEAT.y1 - SEAT.y0, 12); ctx.fill(); ctx.stroke();
    }
    // brilho da pele
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(48, SEAT.y1 + 10, W - 96, 8);
    ctx.restore();
  }

  function drawFace(x, y, r, rot = 0, squash = 1) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(squash, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip();
    if (face.complete && face.naturalWidth) ctx.drawImage(face, -r - 3, -r - 3, (r + 3) * 2, (r + 3) * 2);
    else { ctx.fillStyle = '#e8c9a0'; ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }

  // cabeças já atiradas nesta ronda (ficam espetadas, como dardos)
  function drawHeads(heads) {
    for (const h of heads) {
      if (h.zona === 'encaixe') {
        // enfiada na folga: espremida, com as almofadas a fechar por cima; e a dormir
        drawFace(h.x, h.y, HEAD_R, 0, 0.8);
        for (const s of [-1, 1]) {
          // as almofadas fecham-se sobre a cabeça: só se vê o meio da cara
          const cx = h.x + s * 19;
          const grad = ctx.createLinearGradient(h.x + s * 8, 0, h.x + s * 28, 0);
          grad.addColorStop(0, '#cbc2ae'); grad.addColorStop(1, '#e9e2d2');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.ellipse(cx, h.y, 10, HEAD_R + 9, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(42,31,23,.7)'; ctx.lineWidth = 2;
          ctx.beginPath();
          if (s > 0) ctx.ellipse(cx, h.y, 10, HEAD_R + 9, 0, Math.PI * 0.6, Math.PI * 1.4);
          else ctx.ellipse(cx, h.y, 10, HEAD_R + 9, 0, -Math.PI * 0.4, Math.PI * 0.4);
          ctx.stroke();
        }
        const z = (h.t * 0.8) % 1;
        ctx.globalAlpha = 1 - z;
        outlined('z', h.x + 16 + z * 14, h.y - 26 - z * 30, 14 + z * 8, '#f6efe0');
        ctx.globalAlpha = 1;
      } else {
        const bounce = h.zona === 'almofada' || h.zona === 'quase' || h.zona === 'assento' ? Math.max(0, 1 - h.t * 3) : 0;
        const yy = h.y - Math.abs(Math.sin(h.t * 18)) * 6 * bounce;
        drawFace(h.x, yy, HEAD_R * 0.9, 0.3);
        if (h.zona === 'fora' && h.t < 0.8) {
          ctx.fillStyle = '#f5c542'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
          for (let i = 0; i < 5; i++) {
            const a = i * 1.26 + h.t * 4;
            ctx.beginPath(); ctx.arc(h.x + Math.cos(a) * 28, h.y - 20 + Math.sin(a) * 8, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
        }
      }
    }
  }

  function drawAim() {
    const T = TONTURA[g.ronda];
    const ghost = g.ronda >= 1 && !calmo(); // a partir da 2.ª ronda vê a dobrar
    const line = (x0, y0, x1, y1, a) => {
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#d8322a'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    };
    if (mode === 'mira-x') {
      const x = mira('x');
      if (ghost) line(x + 9, 60, x + 9, H - 60, 0.3);
      line(x, 60, x, H - 60, 1);
      outlined('▼', x, 58, 20, '#d8322a');
    } else if (mode === 'mira-y') {
      const y = mira('y');
      line(g.aim.x, 60, g.aim.x, H - 60, 0.35);
      if (ghost) line(20, y + 8, W - 20, y + 8, 0.3);
      line(20, y, W - 20, y, 1);
      ctx.strokeStyle = '#d8322a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(g.aim.x, y, 16 + T.s * 0.3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function draw() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawRoom();
    const sway = g && jogando() && !calmo() ? Math.sin(g.t * 1.3) * 0.006 * g.ronda : 0;
    drawSofa(sway);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    if (!g) {
      // antes de começar: a cabeça a dormir, encaixada na folga
      intro.t += 0.016;
      drawHeads([{ x: GAP_X, y: 214, zona: 'encaixe', t: intro.t }]);
      outlined('Toca para atirar!', W / 2, 108, 26);
      ctx.font = '600 14px Archivo, system-ui, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText(`O teu recorde: ${best} pontos`, W / 2, H - 22);
      return;
    }

    drawHeads(g.heads);
    if (mode === 'mira-x' || mode === 'mira-y') drawAim();
    if (g.flight) {
      // a cabeça voa de baixo para o sofá, a encolher (vai para longe) e a rodar
      const f = g.flight, k = Math.min(1, f.t / FLIGHT), e = 1 - (1 - k) * (1 - k);
      const x = W / 2 + (f.x - W / 2) * e, y = H + 60 + (f.y - H - 60) * e - Math.sin(k * Math.PI) * 90;
      drawFace(x, y, HEAD_R * (2.6 - 1.6 * e), f.spin * k);
    }

    // marcador: ronda, cabeças que faltam e pontos
    ctx.fillStyle = 'rgba(18,17,16,.72)'; rr(8, 8, 150, 26, 8); ctx.fill();
    ctx.font = '700 12px Archivo, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#f6efe0';
    ctx.fillText(`RONDA ${g.ronda + 1}/${RONDAS}`, 16, 26);
    for (let i = 0; i < CABECAS; i++) {
      const used = i < g.cabeca;
      ctx.globalAlpha = used ? 0.3 : 1;
      drawFace(108 + i * 18, 21, 7);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'right';
    outlined(String(g.score), W - 16, 32, 26);
    ctx.textAlign = 'center';
    if (mode === 'mira-x' || mode === 'mira-y') {
      ctx.font = '700 12px Archivo, system-ui, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText(mode === 'mira-x' ? 'Toca para fixar a mira na horizontal' : 'Toca outra vez: altura… e lá vai cabeça!', W / 2, H - 14);
    }
    for (const tx of g.texts) {
      ctx.globalAlpha = Math.min(1, tx.life * 1.5);
      outlined(tx.text, tx.x, tx.y, tx.size, tx.color);
      ctx.globalAlpha = 1;
    }
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0);
    last = ts;
    if (g && jogando()) update(dt);
    else if (g) { for (const h of g.heads) h.t += dt; }
    draw();
    raf = requestAnimationFrame(loop);
  }
  // só anima quando o jogo está visível; fora do ecrã, o jogo fica em pausa (é por turnos)
  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    cancelAnimationFrame(raf);
    if (e.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }, { threshold: 0.2 });
  io.observe(canvas);

  // a jogar, o toque é imediato; antes, só um toque "limpo" começa (deslizar para fazer scroll não conta)
  canvas.addEventListener('pointerdown', (e) => {
    if (!jogando()) return;
    e.preventDefault();
    tap();
  });
  canvas.addEventListener('click', () => { if (mode === 'intro') start(); });
  document.addEventListener('keydown', (e) => {
    if (!(e.code === 'Space' || e.code === 'ArrowUp')) return;
    if (e.target.closest('input, textarea, button, a, dialog')) return;
    if (jogando()) { e.preventDefault(); if (!e.repeat) tap(); return; }
    if (mode !== 'intro' || e.repeat) return;
    const r = canvas.getBoundingClientRect();
    if (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < r.height * 0.6) return; // o jogo tem de estar à vista
    e.preventDefault();
    start();
  });
  ui.again.addEventListener('click', () => { ui.again.blur(); start(); });

  placar.render();
  draw();
}
