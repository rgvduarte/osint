// A repescagem: minijogo de toques na bola. O Ricardo, promessa do futebol em miúdo, não foi
// selecionado para o anúncio com o Cristiano; aqui tenta outra vez, num campo desmanchado,
// cheio de pedras e de bosta. Cada toque conta; se a bola cair, o júri volta a dizer que não.
import { TEXTOS } from './toques-textos.js';
import { criarPlacar, ligarSubmissao, load, save } from './placar.js';

export const VIDEO = 'https://www.youtube.com/watch?v=gXk6PRzooq0';

const W = 360, H = 540;              // coordenadas lógicas do canvas
const GROUND = H - 44;               // linha do chão
const GRAVITY = 1250, KICK = 720;    // px/s², px/s
const R0 = 30, R_MIN = 21, R_BIG = 9; // raio da bola: inicial, mínimo, extra das chuteiras
const COOLDOWN = 0.25;               // s entre toques (não vale metralhar a bola)
const LB_KEY = 'xinxers-toques-local', BEST_KEY = 'xinxers-toques-recorde', TAKE_KEY = 'xinxers-toques-takes';

const EVENTOS = {
  olheiro: { emoji: '🧐', efeito: 'toques a dobrar 8 s' },
  chuteiras: { emoji: '👟', efeito: 'bola maior 6 s' },
  vaca: { emoji: '🐄', efeito: 'se a bola lhe cair em cima, ressalta' },
  pombo: { emoji: '🐦', efeito: 'desvia a bola' },
  vento: { emoji: '💨', efeito: 'rajadas a partir dos 20 toques' },
};
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function initToques(root) {
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
    video: root.querySelector('[data-video]'),
    board: root.querySelector('[data-board]'),
    boardNote: root.querySelector('[data-board-note]'),
  };
  const face = new Image();
  face.src = 'assets/noivo-cara.jpg';

  for (const el of root.querySelectorAll('[data-t]')) el.textContent = TEXTOS[el.dataset.t];
  if (ui.video) { ui.video.href = VIDEO; ui.video.textContent = `${TEXTOS.video_link} ↗`; }
  root.querySelector('[data-powers]')?.replaceChildren(...Object.entries(EVENTOS).map(([id, e]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="pw-emoji" aria-hidden="true"></span><b></b><span></span>';
    li.children[0].textContent = e.emoji;
    li.children[1].textContent = TEXTOS.eventos[id].nome;
    li.children[2].textContent = e.efeito;
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

  let g = null;       // estado da partida
  let mode = 'intro'; // intro | playing | over
  const setMode = (m) => { mode = m; canvas.parentElement.classList.toggle('playing', m === 'playing'); };
  let raf = 0, last = 0;
  let best = load(BEST_KEY, 0);
  let takes = load(TAKE_KEY, 0);
  const placar = criarPlacar({ path: 'toques', localKey: LB_KEY, board: ui.board, note: ui.boardNote });
  const resetPainel = ligarSubmissao(ui, placar, () => (mode === 'over' ? g : null));

  // o campo desmanchado: pedras e montes de bosta espalhados, sem se sobreporem
  function campo() {
    const list = [];
    const add = (tipo, w) => {
      for (let tries = 0; tries < 30; tries++) {
        const x = rnd(24, W - 24);
        if (list.every((h) => Math.abs(h.x - x) > (h.w + w) / 2 + 8)) { list.push({ tipo, x, w }); return; }
      }
    };
    for (let i = 0; i < 4; i++) add('pedra', rnd(18, 30));
    for (let i = 0; i < 3; i++) add('bosta', 26);
    return list;
  }

  function newGame() {
    takes += 1; save(TAKE_KEY, takes);
    g = {
      t: 0, score: 0, kicks: 0, cool: 0,
      ball: { x: W / 2, y: GROUND - 150, vx: rnd(-30, 30), vy: -KICK * 0.8, r: R0, rot: 0, spin: 0 },
      kid: { x: W / 2, kick: 0, joy: 0 },
      ground: campo(),
      items: [], texts: [], ripples: [],
      cow: null, bird: null,
      wind: { ax: 0, left: 0, next: rnd(3, 6) },
      next: { item: rnd(6, 9), cow: rnd(9, 14), bird: rnd(5, 9) },
      olheiro: 0, chuteiras: 0,
      marco: 0, submitted: false,
    };
  }

  function say(text, color = '#f5c542', y = H * 0.3) {
    g.texts.push({ text, x: W / 2, y, life: 1.5, color });
  }

  function start() {
    newGame();
    setMode('playing');
    ui.over.hidden = true;
  }

  // toque na bola: do lado esquerdo manda-a para a direita, e vice-versa
  function kick(px, py, fromKeyboard = false) {
    const b = g.ball;
    const reach = b.r * (g.chuteiras > 0 ? 2.1 : 1.5) + 8;
    const dx = b.x - px, dy = b.y - py;
    if (!fromKeyboard && dx * dx + dy * dy > reach * reach) { g.ripples.push({ x: px, y: py, life: 0.35 }); return; }
    if (g.cool > 0) return;
    g.cool = COOLDOWN;
    b.vy = -KICK * rnd(0.97, 1.03);
    b.vx = Math.max(-1.2, Math.min(1.2, dx / b.r)) * 230 + rnd(-25, 25);
    b.spin = b.vx / 30;
    g.kid.kick = 0.25;
    g.kicks += 1;
    g.score += g.olheiro > 0 ? 2 : 1;
    for (const m of MARCOS) {
      if (m.toques > g.marco && g.score >= m.toques) { g.marco = m.toques; say(m.texto); g.kid.joy = 1.2; }
    }
  }

  const fala = (id) => TEXTOS.eventos[id].grito;
  const MARCOS = [...TEXTOS.marcos].sort((a, b) => a.toques - b.toques);

  function update(dt) {
    const b = g.ball;
    g.t += dt;
    g.cool = Math.max(0, g.cool - dt);
    for (const k of ['olheiro', 'chuteiras']) g[k] = Math.max(0, g[k] - dt);

    // vento: rajadas a partir dos 20 toques
    const w = g.wind;
    if (w.left > 0) { w.left -= dt; if (w.left <= 0) w.ax = 0; }
    else if (g.score >= 20 && (w.next -= dt) <= 0) {
      w.ax = (Math.random() < 0.5 ? -1 : 1) * Math.min(200, 100 + g.score);
      w.left = 2.5; w.next = rnd(6, 10);
      say(fala('vento'), '#cfe3f0');
    }

    // bola: gravidade a subir com os toques, raio a encolher (as chuteiras dão-lhe mais tamanho)
    const grav = GRAVITY * (1 + Math.min(0.45, g.kicks * 0.008)) * (g.chuteiras > 0 ? 0.85 : 1);
    const rTarget = Math.max(R_MIN, R0 - g.kicks * 0.08) + (g.chuteiras > 0 ? R_BIG : 0);
    b.r += (rTarget - b.r) * Math.min(1, dt * 6);
    b.vy += grav * dt;
    b.vx += w.ax * dt;
    b.vx *= 1 - Math.min(1, dt * 0.25);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; b.spin = -b.spin; }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; b.spin = -b.spin; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.4; }

    // miúdo: corre atrás da bola, com atraso
    const kid = g.kid;
    kid.x += (Math.max(34, Math.min(W - 34, b.x)) - kid.x) * Math.min(1, dt * 5);
    kid.kick = Math.max(0, kid.kick - dt);
    kid.joy = Math.max(0, kid.joy - dt);

    // olheiro e chuteiras: aparecem no ar; a bola tem de lhes tocar
    if (g.score >= 5 && (g.next.item -= dt) <= 0) {
      g.next.item = rnd(9, 14);
      g.items.push({ id: Math.random() < 0.5 ? 'olheiro' : 'chuteiras', x: rnd(50, W - 50), y: rnd(120, 280), life: 7, bob: rnd(0, 6) });
    }
    g.items = g.items.filter((it) => {
      it.life -= dt; it.bob += dt * 3;
      const y = it.y + Math.sin(it.bob) * 6;
      if ((b.x - it.x) ** 2 + (b.y - y) ** 2 < (b.r + 18) ** 2) {
        g[it.id] = it.id === 'olheiro' ? 8 : 6;
        say(fala(it.id));
        return false;
      }
      return it.life > 0;
    });

    // vaca: atravessa o campo e deixa bosta; se a bola lhe cair em cima, ressalta
    if (!g.cow && g.score >= 12 && (g.next.cow -= dt) <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      g.cow = { x: dir > 0 ? -40 : W + 40, dir, dropAt: rnd(60, W - 60), dropped: false };
      say(fala('vaca'), '#f6efe0');
    }
    if (g.cow) {
      const c = g.cow;
      c.x += c.dir * 55 * dt;
      if (!c.dropped && (c.dir > 0 ? c.x > c.dropAt : c.x < c.dropAt)) {
        c.dropped = true;
        g.ground.push({ tipo: 'bosta', x: c.x - c.dir * 24, w: 26 });
      }
      if (b.vy > 0 && Math.abs(b.x - c.x) < 30 && b.y + b.r > GROUND - 44 && b.y < GROUND - 20) {
        b.y = GROUND - 44 - b.r; b.vy = -KICK * 0.8; b.vx += c.dir * 60;
        say('A vaca salvou-te!', '#f6efe0');
      }
      if (c.x < -60 || c.x > W + 60) { g.cow = null; g.next.cow = rnd(15, 25); }
    }

    // pombo: atravessa o céu; se a bola lhe bater, vai para um lado qualquer
    if (!g.bird && g.score >= 8 && (g.next.bird -= dt) <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      g.bird = { x: dir > 0 ? -20 : W + 20, y: rnd(90, 220), dir, hit: false, flap: 0 };
    }
    if (g.bird) {
      const p = g.bird;
      p.x += p.dir * (p.hit ? 220 : 120) * dt;
      p.y += (p.hit ? -160 : Math.sin(g.t * 3) * 20) * dt;
      p.flap += dt;
      if (!p.hit && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + 14) ** 2) {
        p.hit = true;
        b.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(200, 300);
        b.vy *= 0.5;
        say(fala('pombo'), '#f6efe0');
      }
      if (p.x < -40 || p.x > W + 40 || p.y < -30) { g.bird = null; g.next.bird = rnd(10, 18); }
    }

    for (const tx of g.texts) { tx.life -= dt; tx.y -= dt * 30; }
    g.texts = g.texts.filter((tx) => tx.life > 0);
    for (const rp of g.ripples) rp.life -= dt;
    g.ripples = g.ripples.filter((rp) => rp.life > 0);

    // a bola caiu: onde?
    if (b.y + b.r >= GROUND + 6) {
      const h = g.ground.find((q) => Math.abs(q.x - b.x) < q.w / 2); // onde toca o fundo da bola
      die(h ? h.tipo : 'relva');
    }
  }

  function die(onde, fugiu = false) {
    setMode('over');
    const newBest = g.score > best;
    if (newBest) { best = g.score; save(BEST_KEY, best); }
    ui.overTitle.textContent = `${g.score} toque${g.score === 1 ? '' : 's'}`;
    ui.overText.textContent = fugiu ? 'Saíste a meio do take. O júri não perdoa.' : pick(TEXTOS.quedas[onde]);
    if (newBest && g.score > 0) ui.overText.textContent += ' ' + pick(TEXTOS.recorde_frases);
    const v = [...TEXTOS.veredictos].sort((a, b) => a.min - b.min).filter((q) => g.score >= q.min).pop();
    ui.verdict.textContent = v ? v.texto : '';
    resetPainel(g.score > 0);
    ui.over.hidden = false;
  }

  // ---- desenho
  function fitFont(text, size, max, weight = 400, family = '"Luckiest Guy", "Arial Black", sans-serif') {
    do ctx.font = `${weight} ${size}px ${family}`;
    while (ctx.measureText(text).width > max && --size > 9);
  }
  const INK = '#2a1f17';

  function drawField() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#cfe3f0'); sky.addColorStop(1, '#f1e4c6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // colinas e a baliza torta ao fundo
    ctx.fillStyle = '#b9c98a';
    ctx.beginPath(); ctx.moveTo(0, GROUND - 70);
    ctx.quadraticCurveTo(90, GROUND - 120, 190, GROUND - 80); ctx.quadraticCurveTo(290, GROUND - 45, W, GROUND - 95);
    ctx.lineTo(W, GROUND); ctx.lineTo(0, GROUND); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(42,31,23,.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(250, GROUND); ctx.lineTo(252, GROUND - 62); ctx.lineTo(334, GROUND - 57); ctx.lineTo(333, GROUND); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(42,31,23,.18)';
    for (let x = 258; x < 334; x += 9) { ctx.beginPath(); ctx.moveTo(x, GROUND - 60); ctx.lineTo(x + 2, GROUND); ctx.stroke(); }
    // relva gasta, com peladas de terra
    ctx.fillStyle = '#8fa653'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#a9834f';
    for (const [x, w] of [[20, 50], [120, 80], [230, 40], [300, 55]]) { ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 22, w / 2, 9, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = INK; ctx.fillRect(0, GROUND, W, 3);
    if (!g) return;
    for (const h of g.ground) {
      if (h.tipo === 'pedra') {
        ctx.fillStyle = '#9aa0a8'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(h.x - h.w / 2, GROUND + 2);
        ctx.quadraticCurveTo(h.x - h.w / 2, GROUND - h.w * 0.45, h.x - h.w * 0.1, GROUND - h.w * 0.5);
        ctx.quadraticCurveTo(h.x + h.w / 2, GROUND - h.w * 0.55, h.x + h.w / 2, GROUND + 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.font = '24px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('💩', h.x, GROUND + 6);
      }
    }
  }

  function drawBall(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.fillStyle = '#fbfbf7'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = INK;
    const pent = (cx, cy, s) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5) + Math.atan2(cy, cx);
        ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      }
      ctx.closePath(); ctx.fill();
    };
    pent(0, 0, b.r * 0.34);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      pent(Math.cos(a) * b.r * 0.92, Math.sin(a) * b.r * 0.92, b.r * 0.3);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // o miúdo Ricardo, camisola 7, com a cara da foto
  function drawKid(x, kick, joy) {
    const hip = GROUND - 30, shoulder = GROUND - 56;
    ctx.save();
    ctx.lineCap = 'round'; ctx.strokeStyle = INK;
    // pernas (a direita dá o toque)
    const swing = kick > 0 ? Math.sin((kick / 0.25) * Math.PI) * 0.9 : 0;
    const leg = (ox, ang) => {
      ctx.lineWidth = 7; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(x + ox, hip); ctx.lineTo(x + ox + Math.sin(ang) * 26, hip + Math.cos(ang) * 26); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#f2f0e6';
      ctx.beginPath(); ctx.moveTo(x + ox + Math.sin(ang) * 12, hip + Math.cos(ang) * 12); ctx.lineTo(x + ox + Math.sin(ang) * 24, hip + Math.cos(ang) * 24); ctx.stroke();
    };
    leg(-6, 0.08);
    leg(6, -0.08 - swing);
    // calções e camisola
    ctx.fillStyle = '#1f6b3a'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(x - 13, hip - 8, 26, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d8322a';
    ctx.beginPath(); ctx.moveTo(x - 14, shoulder); ctx.lineTo(x + 14, shoulder); ctx.lineTo(x + 12, hip - 7); ctx.lineTo(x - 12, hip - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff6d8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 14px "Luckiest Guy", "Arial Black", sans-serif';
    ctx.fillText('7', x, shoulder + 12);
    // braços (no ar quando festeja)
    ctx.lineWidth = 5; ctx.strokeStyle = INK;
    const up = joy > 0 ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(x - 13, shoulder + 3); ctx.lineTo(x - 22, shoulder + 3 + up * 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 13, shoulder + 3); ctx.lineTo(x + 22, shoulder + 3 + up * 16); ctx.stroke();
    // cabeça grande, de caricatura
    const hr = 21, hy = shoulder - hr + 2;
    ctx.beginPath(); ctx.arc(x, hy, hr, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip();
    if (face.complete && face.naturalWidth) ctx.drawImage(face, x - hr - 4, hy - hr - 4, (hr + 4) * 2, (hr + 4) * 2);
    else { ctx.fillStyle = '#e8c9a0'; ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  function drawEmoji(e, x, y, size, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, 0, 0);
    ctx.restore();
  }

  function outlined(text, x, y, size, max = W - 28, fill = '#f5c542') {
    fitFont(text, size, max);
    ctx.lineWidth = Math.max(4, size / 6); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }

  function draw() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawField();

    if (!g) {
      // antes de começar: a bola a saltitar no pé do miúdo
      const bob = Math.abs(Math.sin(performance.now() / 380)) * 40;
      drawKid(W / 2, 0, 0);
      drawBall({ x: W / 2 + 14, y: GROUND - 40 - bob - R0, r: R0, rot: 0 });
    } else {
      const b = g.ball;
      // vento
      if (g.wind.ax) {
        ctx.strokeStyle = 'rgba(42,31,23,.25)'; ctx.lineWidth = 2;
        const dir = Math.sign(g.wind.ax);
        for (let i = 0; i < 7; i++) {
          const y = 70 + i * 55, x = ((g.t * 420 * dir + i * 97) % (W + 80) + W + 80) % (W + 80) - 40;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * 36, y); ctx.stroke();
        }
      }
      if (g.bird) drawEmoji('🐦', g.bird.x, g.bird.y, 26, g.bird.dir > 0);
      if (g.cow) drawEmoji('🐄', g.cow.x, GROUND - 22, 44, g.cow.dir > 0);
      for (const it of g.items) {
        const y = it.y + Math.sin(it.bob) * 6;
        ctx.globalAlpha = it.life < 1.5 ? 0.4 + 0.6 * Math.abs(Math.sin(it.life * 10)) : 1;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(it.x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        drawEmoji(EVENTOS[it.id].emoji, it.x, y + 1, 21);
        ctx.globalAlpha = 1;
      }
      drawKid(g.kid.x, g.kid.kick, g.kid.joy);
      drawBall(b);
      for (const rp of g.ripples) {
        ctx.strokeStyle = `rgba(216,50,42,${rp.life / 0.35})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, 22 - rp.life * 30, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // claquete do casting (abaixo da placa com o nome do jogo)
    const take = `CASTING · TAKE ${Math.max(1, takes + (g ? 0 : 1))}`;
    ctx.save();
    ctx.font = '700 11px Archivo, system-ui, sans-serif';
    const cw = Math.ceil(ctx.measureText(take).width) + 12;
    ctx.translate(10, 40);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, cw, 30);
    ctx.fillStyle = '#f6efe0';
    for (let x = 4; x < cw - 4; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 8, 0); ctx.lineTo(x + 2, 8); ctx.lineTo(x - 6, 8); ctx.closePath(); ctx.fill(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(take, 6, 24);
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (g) {
      outlined(String(g.score), W / 2, 64, 44);
      const fx = [['olheiro', '🧐'], ['chuteiras', '👟']].filter(([k]) => g[k] > 0);
      ctx.font = '600 13px Archivo, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = INK;
      fx.forEach(([k, e], i) => ctx.fillText(`${e} ${g[k].toFixed(1)}s`, W - 10, 56 + i * 18));
      ctx.textAlign = 'center';
      for (const tx of g.texts) {
        ctx.globalAlpha = Math.min(1, tx.life * 1.5);
        outlined(tx.text, tx.x, tx.y, 22, W - 28, tx.color);
        ctx.globalAlpha = 1;
      }
    }
    if (mode === 'intro') {
      outlined('Toca na bola!', W / 2, H * 0.36, 28);
      ctx.font = '600 14px Archivo, system-ui, sans-serif'; ctx.fillStyle = INK;
      ctx.fillText(`O teu recorde: ${best} toques`, W / 2, H * 0.36 + 28);
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
  const io = new IntersectionObserver(([e]) => {
    cancelAnimationFrame(raf);
    if (e.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(loop); }
    else if (mode === 'playing') die('relva', true);
  }, { threshold: 0.2 });
  io.observe(canvas);

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
  };
  // a jogar, o toque é imediato; antes, só um toque "limpo" começa (deslizar para fazer scroll não conta)
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'playing') return;
    e.preventDefault();
    kick(...toCanvas(e));
  });
  canvas.addEventListener('click', () => { if (mode === 'intro') start(); });
  document.addEventListener('keydown', (e) => {
    if (!(e.code === 'Space' || e.code === 'ArrowUp')) return;
    if (e.target.closest('input, textarea, button, a, dialog')) return;
    const r = canvas.getBoundingClientRect();
    if (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < r.height * 0.6) return; // o jogo tem de estar à vista
    e.preventDefault();
    if (mode === 'intro') return start();
    // pelo teclado, só se a bola estiver a descer e ao alcance do pé
    if (mode === 'playing' && g.ball.vy > -100 && g.ball.y > H * 0.35) kick(g.ball.x + rnd(-8, 8), g.ball.y + g.ball.r * 0.5, true);
  });
  ui.again.addEventListener('click', start);

  placar.render();
  draw();
}
