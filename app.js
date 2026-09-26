// Inspector Xinxers — compara uma selfie com o índice pré-calculado (data/faces.json).
// Tudo corre no browser; a selfie nunca sai do dispositivo.

const FACEAPI_VERSION = '1.7.15';
const CDN = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACEAPI_VERSION}`;
const INDEX_URL = 'data/faces.json';

const $ = (id) => document.getElementById(id);
const els = {
  indexStatus: $('indexStatus'), video: $('video'), startCam: $('startCam'), cameraIdle: $('cameraIdle'),
  snap: $('snap'), fileInput: $('fileInput'), clues: $('clues'), clueRow: $('clueRow'), captureMsg: $('captureMsg'),
  resultsCard: $('resultsCard'), resultsTitle: $('resultsTitle'), resultsMsg: $('resultsMsg'), grid: $('grid'),
  threshold: $('threshold'), lightbox: $('lightbox'), lbImg: $('lbImg'), lbBox: $('lbBox'), lbInfo: $('lbInfo'),
  lbOpen: $('lbOpen'), lbClose: $('lbClose'), lbImgWrap: $('lbImgWrap'),
};

const state = {
  index: null,       // { photos, faces: [{p, b, d: Float32Array}] }
  refs: [],          // descritores das selfies
  matches: [],       // [{photo, face, dist}] ordenado
  stream: null,
};

let faceapi = null;
let modelsReady = null;

// ---------------------------------------------------------------- arranque

function loadModels() {
  modelsReady ??= (async () => {
    faceapi = await import(`${CDN}/dist/face-api.esm.js`);
    try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
    await faceapi.tf.ready();
    const url = `${CDN}/model`;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
    ]);
  })();
  return modelsReady;
}

async function loadIndex() {
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const faces = raw.faces.map((f) => ({ p: f.p, b: f.b, d: decodeDescriptor(f.d) }));
    state.index = { photos: raw.photos, faces, generatedAt: raw.generatedAt };
    if (!raw.photos.length) {
      els.indexStatus.textContent = 'O arquivo ainda está vazio — falta correr o indexador.';
      els.indexStatus.classList.add('warn');
      return;
    }
    const when = raw.generatedAt ? new Date(raw.generatedAt).toLocaleDateString('pt-PT') : '';
    els.indexStatus.textContent = `${raw.photos.length} fotos · ${faces.length} caras no arquivo${when ? ` · atualizado ${when}` : ''}`;
  } catch (e) {
    els.indexStatus.textContent = `Não consegui abrir o arquivo de caras (${e.message}).`;
    els.indexStatus.classList.add('warn');
  }
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
    els.snap.hidden = false;
    setMsg(els.captureMsg, 'Enquadra a cara no oval, com boa luz, e tira a selfie.');
  } catch (e) {
    setMsg(els.captureMsg, 'Sem acesso à câmara. Usa “Carregar foto” para escolher uma selfie.', true);
  }
  loadModels().catch(() => {});
}

function snapFromVideo() {
  const v = els.video;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  return c;
}

async function fileToCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------- pistas (selfies)

async function addClue(canvas) {
  if (!state.index?.photos.length) {
    setMsg(els.captureMsg, 'O arquivo de caras ainda não está disponível.', true);
    return;
  }
  setMsg(els.captureMsg, 'O inspector está a examinar a tua cara…');
  els.snap.disabled = true;
  try {
    await loadModels();
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
    const found = await faceapi.detectAllFaces(canvas, opts).withFaceLandmarks().withFaceDescriptors();
    if (!found.length) {
      setMsg(els.captureMsg, 'Não encontrei nenhuma cara. Tenta com mais luz e a cara de frente.', true);
      return;
    }
    // Na selfie, a cara que interessa é a maior.
    const main = found.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a));
    state.refs.push(main.descriptor);
    renderClue(canvas, main.detection.box);
    setMsg(els.captureMsg, found.length > 1
      ? 'Apareceu mais do que uma cara — usei a maior.'
      : 'Pista registada. Podes juntar outra selfie para afinar a busca.');
    search();
  } catch (e) {
    console.error(e);
    setMsg(els.captureMsg, `Algo correu mal ao analisar a imagem (${e.message}).`, true);
  } finally {
    els.snap.disabled = false;
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
  btn.title = 'Remover esta pista';
  btn.append(c);
  btn.addEventListener('click', () => {
    state.refs.splice([...els.clueRow.children].indexOf(btn), 1);
    btn.remove();
    els.clues.hidden = !state.refs.length;
    search();
  });
  els.clueRow.append(btn);
  els.clues.hidden = false;
}

// ---------------------------------------------------------------- busca

function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

function search() {
  if (!state.refs.length) { els.resultsCard.hidden = true; return; }
  const firstTime = els.resultsCard.hidden;
  const best = new Map(); // photo index -> {face, dist}
  for (const face of state.index.faces) {
    let d = Infinity;
    for (const r of state.refs) d = Math.min(d, distance(r, face.d));
    const cur = best.get(face.p);
    if (!cur || d < cur.dist) best.set(face.p, { face, dist: d });
  }
  state.matches = [...best.entries()]
    .map(([p, m]) => ({ photo: state.index.photos[p], ...m }))
    .sort((a, b) => a.dist - b.dist);
  renderResults();
  if (firstTime) els.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function verdict(d) {
  if (d < 0.42) return { label: 'Culpado!', cls: 'high' };
  if (d < 0.50) return { label: 'Suspeito forte', cls: 'mid' };
  return { label: 'Talvez', cls: 'low' };
}

function renderResults() {
  const t = +els.threshold.value;
  const hits = state.matches.filter((m) => m.dist <= t);
  els.resultsCard.hidden = false;
  els.resultsTitle.textContent = hits.length === 1 ? '1 foto encontrada' : `${hits.length} fotos encontradas`;
  setMsg(els.resultsMsg, hits.length
    ? 'Toca numa foto para a ver maior. Se faltarem fotos, puxa o rigor para “Mais fotos”.'
    : 'Nenhuma foto com este rigor. Puxa para “Mais fotos” ou junta outra selfie.');
  els.grid.replaceChildren(...hits.map(renderCard));
}

function renderCard(m) {
  const v = verdict(m.dist);
  const card = document.createElement('button');
  card.className = 'tile';
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  img.src = m.photo.t || m.photo.s;
  img.addEventListener('error', () => card.classList.add('broken'), { once: true });
  const tag = document.createElement('span');
  tag.className = `tag ${v.cls}`;
  tag.textContent = v.label;
  card.append(img, tag);
  card.addEventListener('click', () => openLightbox(m));
  return card;
}

// ---------------------------------------------------------------- lightbox

function openLightbox(m) {
  const [x, y, w, h] = m.face.b;
  els.lbImgWrap.style.setProperty('--r', m.photo.w / m.photo.h);
  els.lbImg.src = m.photo.t || m.photo.s;
  // Carrega a versão maior por cima, se existir.
  if (m.photo.f && m.photo.f !== els.lbImg.src) {
    const big = new Image();
    big.onload = () => { if (els.lightbox.open) els.lbImg.src = big.src; };
    big.src = m.photo.f;
  }
  Object.assign(els.lbBox.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
  els.lbInfo.textContent = `${verdict(m.dist).label} · semelhança ${Math.round(Math.max(0, 1 - m.dist) * 100)}%`;
  els.lbOpen.href = m.photo.f || m.photo.s;
  els.lightbox.showModal();
}

// ---------------------------------------------------------------- util

function setMsg(el, text, warn = false) {
  el.textContent = text;
  el.classList.toggle('warn', warn);
}

// ---------------------------------------------------------------- eventos

els.startCam.addEventListener('click', startCamera);
els.snap.addEventListener('click', () => addClue(snapFromVideo()));
els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = '';
  if (file) addClue(await fileToCanvas(file));
});
els.threshold.addEventListener('input', renderResults);
els.lbClose.addEventListener('click', () => els.lightbox.close());
els.lightbox.addEventListener('click', (e) => { if (e.target === els.lightbox) els.lightbox.close(); });

loadIndex();
