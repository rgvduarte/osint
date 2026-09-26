// Inspector Xinxers — compara uma selfie com o índice pré-calculado (data/faces.json).
// Tudo corre no browser; a selfie nunca sai do dispositivo.

const FACEAPI_VERSION = '1.7.15';
const TFJS_VERSION = '4.22.0'; // versão do TensorFlow.js incluída no face-api
const CDN = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACEAPI_VERSION}`;
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/`;
const INDEX_URL = 'data/faces.json';

// No Safari (sobretudo iPhone) o motor WebGL do TensorFlow.js pode bloquear na primeira análise.
// Aí o WebAssembly é o mais fiável; nos outros browsers o WebGL é mais rápido.
const APPLE_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  || /^((?!chrome|chromium|crios|fxios|android|edg).)*safari/i.test(navigator.userAgent);
const BACKENDS = APPLE_WEBKIT ? ['wasm', 'webgl', 'cpu'] : ['webgl', 'wasm', 'cpu'];
const WARMUP_MS = { webgl: 25_000, wasm: 25_000, cpu: 60_000 };
const DETECT_MS = 30_000;
const MAX_SELFIE_SIDE = 960;

const $ = (id) => document.getElementById(id);
const els = {
  indexStatus: $('indexStatus'), video: $('video'), startCam: $('startCam'), cameraIdle: $('cameraIdle'),
  snap: $('snap'), fileInput: $('fileInput'), clues: $('clues'), clueRow: $('clueRow'), captureMsg: $('captureMsg'),
  clueCount: $('clueCount'), engineMsg: $('engineMsg'), photoCount: $('photoCount'),
  resultsCard: $('resultsCard'), resultsTitle: $('resultsTitle'), resultsMsg: $('resultsMsg'), grid: $('grid'),
  threshold: $('threshold'), lightbox: $('lightbox'), lbImg: $('lbImg'), lbBox: $('lbBox'), lbInfo: $('lbInfo'),
  lbOpen: $('lbOpen'), lbClose: $('lbClose'), lbImgWrap: $('lbImgWrap'),
  hat: $('hat'), peek: $('peek'), peekSays: $('peekSays'), mission: $('mission'), destruct: $('destruct'),
  wanted: $('wanted'), wantedText: $('wantedText'), wantedClose: $('wantedClose'),
};

const state = {
  index: null,       // { photos, faces: [{p, b, d: Float32Array}] }
  refs: [],          // descritores das selfies
  matches: [],       // [{photo, face, dist}] ordenado
  stream: null,
  inspector: null,   // descritor da cara do próprio inspector (easter egg)
};

let faceapi = null;
let modelsReady = null;
let backendIdx = -1;

// ---------------------------------------------------------------- motor de IA

const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} demorou demasiado`)), ms)),
]);

const engine = (text) => { els.engineMsg.textContent = text; };

function loadModels() {
  modelsReady ??= resetOnFail((async () => {
    engine('A acordar o inspector…');
    faceapi = await import(`${CDN}/dist/face-api.esm.js`);
    faceapi.tf.setWasmPaths(WASM_CDN);
    return nextBackend();
  })());
  return modelsReady;
}

// Se nenhum motor arrancar, deixa tentar outra vez do zero no próximo clique.
function resetOnFail(promise) {
  return promise.catch((e) => {
    modelsReady = null;
    backendIdx = -1;
    engine(`O inspector não arrancou neste browser (${e.message}).`);
    throw e;
  });
}

// Passa ao motor seguinte da lista, recarrega os modelos nele e faz um aquecimento com tempo limite.
async function nextBackend() {
  while (++backendIdx < BACKENDS.length) {
    const name = BACKENDS[backendIdx];
    try {
      if (!(await withTimeout(faceapi.tf.setBackend(name), 20_000, name))) continue;
      await faceapi.tf.ready();
      const nets = [faceapi.nets.ssdMobilenetv1, faceapi.nets.faceLandmark68Net, faceapi.nets.faceRecognitionNet];
      for (const net of nets) if (net.isLoaded) net.dispose();
      engine('A descarregar os modelos (≈12 MB, só da primeira vez)…');
      await Promise.all(nets.map((net) => net.loadFromUri(`${CDN}/model`)));
      engine('A afinar a lupa…');
      const blank = document.createElement('canvas');
      blank.width = blank.height = 160;
      await withTimeout(runDetection(blank), WARMUP_MS[name], 'O aquecimento');
      engine(`Inspector pronto (${name}).`);
      return name;
    } catch (e) {
      console.warn(`motor ${name} falhou:`, e);
    }
  }
  throw new Error('nenhum motor funcionou');
}

function runDetection(canvas) {
  const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
  return faceapi.detectAllFaces(canvas, opts).withFaceLandmarks().withFaceDescriptors();
}

// Deteção com tempo limite: se o motor atual encravar, muda para o seguinte e tenta outra vez.
async function detectWithFallback(canvas) {
  await loadModels();
  try {
    return await withTimeout(runDetection(canvas), DETECT_MS, 'A análise');
  } catch (e) {
    console.warn(e);
    engine('A trocar de lupa…');
    modelsReady = resetOnFail(nextBackend());
    await modelsReady;
    return withTimeout(runDetection(canvas), DETECT_MS, 'A análise');
  }
}

async function loadIndex() {
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const { photos, faces } = unpackIndex(raw);
    state.index = { photos, faces, generatedAt: raw.generatedAt };
    if (!raw.photos.length) {
      els.indexStatus.textContent = 'Arquivo vazio: falta revelar o rolo.';
      els.indexStatus.classList.add('warn');
      return;
    }
    const when = raw.generatedAt ? new Date(raw.generatedAt).toLocaleDateString('pt-PT') : '';
    els.indexStatus.textContent = `${raw.photos.length} fotogramas · ${faces.length} caras no arquivo${when ? ` · revelado ${when}` : ''}`;
    els.photoCount.textContent = raw.photos.length.toLocaleString('pt-PT');
  } catch (e) {
    els.indexStatus.textContent = `Não consegui abrir o arquivo (${e.message}).`;
    els.indexStatus.classList.add('warn');
  }
}

async function loadInspector() {
  try {
    const res = await fetch('data/inspector.json');
    if (res.ok) state.inspector = decodeDescriptor((await res.json()).d);
  } catch {}
}

// Formato do índice: ver indexer/format.mjs (v2 compacto; v1 ainda aceite).
function unpackIndex(raw) {
  if (raw.version === 2) {
    const base = raw.base || '';
    return {
      photos: raw.photos.map(([s, f, w, h, t]) => ({ s: base + s, f: base + (f || s), w, h, t })),
      faces: raw.faces.map(([p, x, y, w, h, scale, q, mu, sd]) => ({ p, b: [x, y, w, h], d: decodeInt8(q, scale), mu, sd })),
    };
  }
  return { photos: raw.photos, faces: raw.faces.map((f) => ({ p: f.p, b: f.b, d: decodeDescriptor(f.d) })) };
}

function decodeInt8(b64, scale) {
  const bin = atob(b64);
  const d = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) d[i] = ((bin.charCodeAt(i) << 24) >> 24) * scale;
  return d;
}

function decodeDescriptor(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// ---------------------------------------------------------------- câmara

async function startCamera() {
  setMsg(els.captureMsg, 'A ligar a câmara…');
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
    });
    els.video.srcObject = state.stream;
    await els.video.play();
    els.cameraIdle.hidden = true;
    document.body.classList.add('live');
    setMsg(els.captureMsg, 'Cara ao centro, boa luz, sem óculos escuros. Carrega no botão vermelho.');
  } catch (e) {
    state.stream = null;
    setMsg(els.captureMsg, 'Sem acesso à câmara. Toca em “Rolo”: dá para escolher uma foto ou tirar uma selfie aí.', true);
  }
  loadModels().catch(() => {});
}

// Numa selfie a cara é grande: reduzir a imagem acelera muito a análise no telemóvel.
function toCanvas(source, w, h) {
  const scale = Math.min(1, MAX_SELFIE_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}

function snapFromVideo() {
  return toCanvas(els.video, els.video.videoWidth, els.video.videoHeight);
}

async function fileToCanvas(file) {
  // <img> respeita a orientação EXIF em todos os browsers atuais, incluindo Safari.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return toCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- pistas (selfies)

async function addClue(canvas) {
  if (!state.index?.photos.length) {
    setMsg(els.captureMsg, 'O arquivo de caras ainda não está disponível.', true);
    return;
  }
  setMsg(els.captureMsg, 'O inspector está a examinar o suspeito…');
  els.snap.disabled = true;
  document.body.classList.add('busy');
  const peek = showPeek();
  try {
    const found = await detectWithFallback(canvas);
    if (!found.length) {
      setMsg(els.captureMsg, 'Nem sinal de cara. Tenta com mais luz e de frente para a câmara.', true);
      peek.done('Nem sinal de cara…');
      return;
    }
    // Na selfie, a cara que interessa é a maior.
    const main = found.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a));
    state.refs.push(main.descriptor);
    renderClue(canvas, main.detection.box);
    setMsg(els.captureMsg, found.length > 1
      ? 'Apareceu mais do que uma cara: fiquei com a maior.'
      : 'Registado. Outra selfie, de outro ângulo, afina a busca.');
    search();
    const caught = collect(+els.threshold.value).some((m) => m.kind === 'seed');
    peek.done(caught ? 'Apanhado!' : 'Hmm… nada por agora.');
    if (state.inspector && distance(main.descriptor, state.inspector) < 0.44) {
      setTimeout(() => showWanted('Alto! Não te podes investigar a ti próprio, Inspector. Mas pronto, as tuas fotos estão aí em baixo.'), 900);
    }
  } catch (e) {
    console.error(e);
    setMsg(els.captureMsg, `Algo correu mal ao analisar a imagem (${e.message}).`, true);
    peek.done('Ups.');
  } finally {
    els.snap.disabled = false;
    document.body.classList.remove('busy');
  }
}

function renderClue(canvas, box) {
  const pad = box.width * 0.25;
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  const w = Math.min(canvas.width - x, box.width + pad * 2), h = Math.min(canvas.height - y, box.height + pad * 2);
  const c = document.createElement('canvas');
  c.width = c.height = 120;
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, 120, 120);
  const btn = document.createElement('button');
  btn.className = 'clue';
  btn.title = 'Tirar esta selfie da investigação';
  btn.append(c);
  btn.addEventListener('click', () => {
    state.refs.splice([...els.clueRow.children].indexOf(btn), 1);
    btn.remove();
    updateClues();
    search();
  });
  els.clueRow.append(btn);
  updateClues();
}

function updateClues() {
  const n = state.refs.length;
  els.clues.hidden = !n;
  els.clueCount.textContent = n === 1 ? '1 selfie' : `${n} selfies`;
}

// ---------------------------------------------------------------- busca

function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// ---- Pontuação
// Distância pura não chega numa galeria de milhares de caras: quem tem uma cara "genérica"
// fica perto de muita gente. Usa-se S-norm: a distância é comparada com o quanto a selfie e
// cada cara da galeria costumam estar perto de caras ao acaso (coorte fixa da galeria; μ/σ
// de cada cara vêm calculados no índice, ver indexer/format.mjs).
const COHORT_SIZE = 800;
const COHORT_TOP = 200;
// Sementes: caras com pontuação acima do rigor do cursor. Expansão: outras fotos da mesma
// pessoa, reconhecidas pela semelhança entre fotos da galeria (mesma câmara, mesma luz),
// desde que a selfie também se pareça com elas (rigor - EXPAND_MARGIN).
const EXPAND_MARGIN = 1.5;
const LINK_DIST = 0.38;
const SURE_SCORE = 5.5;

function cohortStats(d) {
  const faces = state.index.faces;
  const step = Math.max(1, Math.floor(faces.length / COHORT_SIZE));
  const ds = [];
  for (let i = 0; i < faces.length; i += step) {
    const x = distance(d, faces[i].d);
    if (x > 1e-6) ds.push(x);
  }
  ds.sort((a, b) => a - b);
  const top = ds.slice(0, COHORT_TOP);
  const mean = top.reduce((s, x) => s + x, 0) / top.length;
  const sd = Math.sqrt(top.reduce((s, x) => s + (x - mean) ** 2, 0) / top.length) || 1;
  return [mean, sd];
}

function search() {
  if (!state.refs.length) { els.resultsCard.hidden = true; return; }
  const firstTime = els.resultsCard.hidden;
  const faces = state.index.faces;
  const scores = new Float32Array(faces.length).fill(-Infinity);
  for (const r of state.refs) {
    const [qm, qs] = cohortStats(r);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const d = distance(r, f.d);
      const s = f.mu ? 0.5 * ((f.mu - d) / f.sd + (qm - d) / qs) : (qm - d) / qs;
      if (s > scores[i]) scores[i] = s;
    }
  }
  state.scores = scores;
  renderResults();
  if (firstTime) els.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fotos encontradas com o rigor t: uma entrada por foto, com a cara mais convincente.
function collect(t) {
  const { faces, photos } = state.index;
  const sc = state.scores;
  const seeds = [];
  for (let i = 0; i < faces.length; i++) if (sc[i] >= t) seeds.push(i);
  const best = new Map();
  const take = (i, kind) => {
    const cur = best.get(faces[i].p);
    if (!cur || sc[i] > cur.score) best.set(faces[i].p, { face: faces[i], score: sc[i], kind, photo: photos[faces[i].p] });
  };
  for (const i of seeds) take(i, 'seed');
  const gate = t - EXPAND_MARGIN;
  for (let h = 0; h < faces.length; h++) {
    if (sc[h] < gate || sc[h] >= t || best.has(faces[h].p)) continue;
    for (const s of seeds) {
      if (faces[s].p !== faces[h].p && distance(faces[s].d, faces[h].d) < LINK_DIST) { take(h, 'link'); break; }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

function verdict(m) {
  if (m.kind === 'seed' && m.score >= SURE_SCORE) return { label: 'ÉS TU!', cls: 'high' };
  if (m.kind === 'seed') return { label: 'PROVÁVEL', cls: 'mid' };
  return { label: 'TALVEZ', cls: 'low' };
}

function renderResults() {
  const hits = collect(+els.threshold.value);
  els.resultsCard.hidden = false;
  els.resultsTitle.textContent = hits.length;
  setMsg(els.resultsMsg, hits.length
    ? 'Toca num fotograma para o ver maior. Faltam fotos? Puxa a lupa para “mais fotos”.'
    : 'Nada marcado. Puxa a lupa para “mais fotos” ou tira outra selfie.');
  els.grid.replaceChildren(...hits.map(renderCard));
}

// Traço de lápis de cera à volta da cara: um laço à mão que passa do ponto de partida.
const LOOP = 'M62 6C28 2 4 24 6 52s28 44 54 42 38-24 35-48S70 4 44 9c-8 2-14 5-18 9';

const CELL_RATIO = 3 / 2; // fotogramas da folha de contactos (ver .cell no CSS)

// cellRatio: proporção da célula onde a foto está encaixada (object-fit: contain);
// null quando a caixa tem exatamente a proporção da foto.
function mark(photo, box, cls, cellRatio = null) {
  let iw = 1, ih = 1, ox = 0, oy = 0;
  if (cellRatio) {
    const ar = photo.w / photo.h;
    if (ar >= cellRatio) { ih = cellRatio / ar; oy = (1 - ih) / 2; } else { iw = ar / cellRatio; ox = (1 - iw) / 2; }
  }
  const [x, y, w, h] = box;
  const cx = ox + (x + w / 2) * iw, cy = oy + (y + h / 2) * ih;
  const rw = Math.max(0.12, w * iw * 1.9), rh = Math.max(0.12, h * ih * 1.8);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', `mark ${cls}`);
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, {
    left: `${(cx - rw / 2) * 100}%`, top: `${(cy - rh / 2) * 100}%`,
    width: `${rw * 100}%`, height: `${rh * 100}%`,
    transform: `rotate(${((x * 97 + y * 53) % 1) * 24 - 12}deg)`,
  });
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', LOOP);
  svg.append(path);
  return svg;
}

const frameNo = (m) => String(m.face.p + 1).padStart(3, '0');

function renderCard(m) {
  const v = verdict(m);
  const frame = document.createElement('button');
  frame.className = 'frame';
  const cell = document.createElement('div');
  cell.className = 'cell';
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `Fotograma ${frameNo(m)}`;
  img.src = m.photo.t || m.photo.s;
  img.addEventListener('error', () => frame.classList.add('broken'), { once: true });
  cell.append(img, mark(m.photo, m.face.b, v.cls, CELL_RATIO));
  const cap = document.createElement('span');
  cap.className = 'cap';
  cap.innerHTML = `<span>▸ ${frameNo(m)}</span><span class="v ${v.cls}"></span>`;
  cap.lastChild.textContent = v.label;
  frame.append(cell, cap);
  frame.addEventListener('click', () => openLightbox(m));
  return frame;
}

// ---------------------------------------------------------------- lupa

function openLightbox(m) {
  const v = verdict(m);
  els.lbImgWrap.style.setProperty('--r', m.photo.w / m.photo.h);
  els.lbImg.src = m.photo.t || m.photo.s;
  // Carrega a versão maior por cima, se existir.
  if (m.photo.f && m.photo.f !== els.lbImg.src) {
    const big = new Image();
    big.onload = () => { if (els.lightbox.open) els.lbImg.src = big.src; };
    big.src = m.photo.f;
  }
  els.lbBox.replaceChildren(mark(m.photo, m.face.b, v.cls));
  els.lbInfo.textContent = `▸ FOTOGRAMA ${frameNo(m)} · ${v.label}`;
  els.lbOpen.href = m.photo.f || m.photo.s;
  els.lightbox.showModal();
}

// ---------------------------------------------------------------- o inspector em pessoa

const PEEK_LINES = ['Hmm… suspeito!', 'Deixa cá ver…', 'Vai, vai, Xinxers-lupa!', 'Elementar…'];
const PEEK_MIN_MS = 1500;

// Enquanto a selfie é analisada, o inspector espreita no visor num braço de mola.
function showPeek() {
  const started = Date.now();
  els.peekSays.textContent = PEEK_LINES[Math.floor(Math.random() * PEEK_LINES.length)];
  els.peek.classList.add('show');
  return {
    done(line) {
      const wait = Math.max(0, PEEK_MIN_MS - (Date.now() - started));
      setTimeout(() => {
        els.peekSays.textContent = line;
        setTimeout(() => els.peek.classList.remove('show'), 1300);
      }, wait);
    },
  };
}

function showWanted(text) {
  els.wantedText.textContent = text;
  if (!els.wanted.open) els.wanted.showModal();
}

// Três toques no chapéu: cartaz de procurado.
let hatTaps = [];
function tapHat() {
  els.hat.classList.remove('fast');
  void els.hat.offsetWidth; // reinicia a animação
  els.hat.classList.add('fast');
  clearTimeout(tapHat.t);
  tapHat.t = setTimeout(() => els.hat.classList.remove('fast'), 900);
  const now = Date.now();
  hatTaps = [...hatTaps.filter((t) => now - t < 1500), now];
  if (hatTaps.length >= 3) {
    hatTaps = [];
    showWanted('Crime: fotografar o casamento inteiro. Recompensa: um copo no copo-d’água.');
  }
}

// A mensagem autodestrói-se (mais ou menos).
function selfDestruct() {
  if (els.mission.classList.contains('boom')) return;
  els.mission.classList.add('boom');
  setTimeout(() => {
    els.mission.classList.add('singed');
    els.destruct.textContent = '…afinal era só fumo. A missão continua.';
  }, 1000);
}

// ---------------------------------------------------------------- util

function setMsg(el, text, warn = false) {
  el.textContent = text;
  el.classList.toggle('warn', warn);
}

// ---------------------------------------------------------------- eventos

els.startCam.addEventListener('click', startCamera);
// O obturador também liga a câmara, se ainda estiver desligada.
els.snap.addEventListener('click', () => (state.stream ? addClue(snapFromVideo()) : startCamera()));
els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = '';
  if (file) addClue(await fileToCanvas(file));
});
els.threshold.addEventListener('input', renderResults);
els.lbClose.addEventListener('click', () => els.lightbox.close());
els.hat.addEventListener('click', tapHat);
els.destruct.addEventListener('click', selfDestruct);
els.wantedClose.addEventListener('click', () => els.wanted.close());
els.wanted.addEventListener('click', (e) => { if (e.target === els.wanted) els.wanted.close(); });
els.lightbox.addEventListener('click', (e) => { if (e.target === els.lightbox) els.lightbox.close(); });

loadIndex();
loadInspector();
// Adianta o download dos modelos enquanto o convidado lê a página.
setTimeout(() => loadModels().catch(() => {}), 1500);
