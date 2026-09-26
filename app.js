import { DOSSIES } from './dossies.js';
import { fivePoints, alignedInput, l2normalize, ARC_SIZE } from './arcface.js';

// Inspector Xinxers — compara uma selfie com o índice pré-calculado (data/faces.json).
// Tudo corre no browser; a selfie nunca sai do dispositivo.

const FACEAPI_VERSION = '1.7.15';
const TFJS_VERSION = '4.22.0'; // versão do TensorFlow.js incluída no face-api
const CDN = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACEAPI_VERSION}`;
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/`;
const INDEX_URL = 'data/index-arc.json';
// Reconhecimento: ArcFace (InsightFace w600k_mbf) no ONNX Runtime Web; o face-api só deteta
// a cara e os 68 pontos para o alinhamento (arcface.js, o mesmo código do indexador).
const ORT_VERSION = '1.22.0';
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ARC_MODEL = 'models/w600k_mbf.onnx';

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
  lightbox: $('lightbox'), lbImg: $('lbImg'), lbBox: $('lbBox'), lbInfo: $('lbInfo'),
  lbOpen: $('lbOpen'), lbClose: $('lbClose'), lbImgWrap: $('lbImgWrap'), lbPrev: $('lbPrev'), lbNext: $('lbNext'),
  hat: $('hat'), peek: $('peek'), peekSays: $('peekSays'), mission: $('mission'), destruct: $('destruct'),
  wanted: $('wanted'), wantedText: $('wantedText'), wantedClose: $('wantedClose'),
  wantedTitle: $('wantedTitle'), wantedImg: $('wantedImg'), wantedName: $('wantedName'),
  menuBtn: $('menuBtn'), menuList: $('menuList'), page: $('page'), pageTab: $('pageTab'),
  pageTitle: $('pageTitle'), pageBody: $('pageBody'), pageClose: $('pageClose'),
  maybeBox: $('maybeBox'), maybeButton: $('maybeButton'), maybeGrid: $('maybeGrid'),
  zipBox: $('zipBox'), zipButton: $('zipButton'), zipNote: $('zipNote'),
  stamp: $('stamp'), nothing: $('nothing'), hatHint: $('hatHint'), koButton: $('koButton'), toast: $('toast'), peekImg: document.querySelector('#peek img'),
};

const state = {
  index: null,       // { photos, faces: [{p, b, d: Float32Array}] }
  refs: [],          // descritores das selfies
  matches: [],       // [{photo, face, dist}] ordenado
  stream: null,
  inspector: null,   // descritor da cara do próprio inspector (easter egg)
  groom: null,       // caras de referência do noivo, tiradas da galeria (easter egg)
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
    engine('A descarregar o ArcFace (≈14 MB, só da primeira vez)…');
    const ort = await import(`${ORT_CDN}ort.wasm.min.mjs`);
    ort.env.wasm.wasmPaths = ORT_CDN;
    ort.env.wasm.numThreads = 1; // o GitHub Pages não dá isolamento cross-origin para threads
    state.ort = ort;
    state.arc = await ort.InferenceSession.create(ARC_MODEL, { executionProviders: ['wasm'] });
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
      const nets = [faceapi.nets.ssdMobilenetv1, faceapi.nets.faceLandmark68Net];
      for (const net of nets) if (net.isLoaded) net.dispose();
      engine('A descarregar o detetor de caras (≈6 MB, só da primeira vez)…');
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
  return faceapi.detectAllFaces(canvas, opts).withFaceLandmarks();
}

// ArcFace da cara alinhada, em média com a versão espelhada (como no indexador).
async function arcDescriptor(canvas, det) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const input = alignedInput(px, w, h, 4, fivePoints(det.landmarks.positions));
  const S = ARC_SIZE, mirrored = new Float32Array(input.length);
  for (let c = 0; c < 3; c++) for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    mirrored[c * S * S + v * S + u] = input[c * S * S + v * S + (S - 1 - u)];
  }
  const run = async (x) => {
    const feeds = { [state.arc.inputNames[0]]: new state.ort.Tensor('float32', x, [1, 3, S, S]) };
    return (await state.arc.run(feeds))[state.arc.outputNames[0]].data;
  };
  const a = await run(input), b = await run(mirrored);
  return l2normalize(a.map((x, i) => x + b[i]));
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
  try {
    const res = await fetch('data/noivo.json');
    if (res.ok) state.groom = (await res.json()).faces.map(([scale, q]) => decodeInt8(q, scale));
  } catch {}
}

// É o noivo? Média das 10 caras de referência mais próximas (ver indexer/people.mjs).
// Calibrado no índice real (ArcFace): fotos do noivo p99 1,10; noiva ≥ 1,31; outros convidados ≥ 1,19; gente de fora ≥ 1,30.
const GROOM_DIST = 1.15;
function isGroom(d) {
  if (!state.groom) return false;
  const ds = state.groom.map((g) => distance(d, g)).sort((a, b) => a - b).slice(0, 10);
  return ds.reduce((s, x) => s + x, 0) / ds.length < GROOM_DIST;
}

// Formato do índice: ver indexer/format.mjs (v2 compacto; v1 ainda aceite).
function unpackIndex(raw) {
  if (raw.version === 2) {
    const base = raw.base || '';
    return {
      photos: raw.photos.map(([s, f, w, h, t]) => ({ s: base + s, f: base + (f || s), w, h, t })),
      faces: raw.faces.map(([p, x, y, w, h, scale, q]) => ({ p, b: [x, y, w, h], d: decodeInt8(q, scale), px: w * raw.photos[p][2] })),
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
    main.descriptor = await arcDescriptor(canvas, main);
    state.refs.push(main.descriptor);
    renderClue(canvas, main.detection.box);
    setMsg(els.captureMsg, found.length > 1
      ? 'Apareceu mais do que uma cara: fiquei com a maior.'
      : 'Registado. Tira mais uma selfie, de lado ou a sorrir: cada selfie a mais apanha fotos novas.');
    search();
    const hits = collect(THRESHOLD);
    const groom = isGroom(main.descriptor);
    if (groom) {
      setMsg(els.captureMsg, `Olha quem é: o noivo! Estás em ${hits.length} fotos.`);
      peek.done('Apanhei o noivo!');
      setTimeout(() => showPoster('groom', `Estás em ${hits.length} fotos do casamento, mas o inspector encontrou a prova mais comprometedora de todas: esta. Consta que a Inês a viu e casou-se na mesma.`), 1600);
    } else if (hits.length > CELEBRITY) {
      setMsg(els.captureMsg, `Estás em ${hits.length} fotos. Ou és a noiva, ou tens um talento raro para aparecer.`);
      peek.done('Celebridade!');
    } else {
      peek.done(hits.some((m) => verdict(m).cls !== 'low') ? 'Apanhado!' : hits.length ? 'Hmm… talvez.' : 'Nada… por agora.');
    }
    if (!groom && state.inspector && distance(main.descriptor, state.inspector) < 1.12) {
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

// ---- Pesquisa (ArcFace)
// Medido no índice real (1.788 fotos, 8.750 caras):
// - entre caras de pessoas diferentes na mesma foto (familiares incluídos), só ~1% ficam a < 1,05;
//   as 24 caras de pessoas de fora ficam todas a ≥ 1,10 de qualquer cara da galeria;
// - sementes (caras a < 1,05 da selfie) + expansão pela média (a pesquisa repete-se com a média
//   da selfie e das melhores sementes, i.e. a cara tal como aparece nas fotos do casamento):
//   apanha fotos de lado e em movimento; recall mediano ~94%;
// - algumas caras caem num "hub" (zona onde muita gente se parece): aí a mesma pessoa aparecia
//   2 vezes na mesma foto em 15% das fotos. Uma pessoa só aparece uma vez por foto, por isso a
//   app mede esses conflitos e aperta o limiar até ficarem ≤ 5% (1,2% em média, noivos intactos).
//   O que fica de fora vai para "talvez também sejas tu".
const SEED_DIST = 1.05;
const LEVELS = [
  { direct: 1.05, t2: 1.05 },
  { direct: 1.0, t2: 1.0 },
  { direct: 0.95, t2: 0.95 },
  { direct: 0.95, t2: 0.9 },
  { direct: 0.9, t2: 0.85 },
];
const MAX_CONFLICTS = 0.05;
const SMALL_PX = 60;          // caras pequenas têm descritores menos fiáveis: limiar 0,10 mais apertado
const SMALL_PENALTY = 0.10;
const GOOD_PX = 80;           // a média usa caras com boa resolução
const AQE_TOP = 10;
const AQE_ITERS = 2;
const MAYBE_DIST = 1.15;
const MAYBE_MAX = 60;
const THRESHOLD = 'principal';
const MAYBE_THRESHOLD = 'talvez';
const SURE_DIST = 0.85;
const LIKELY_DIST = 1.0;
const CELEBRITY = 250;

const normalize = (v) => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
};

// Uma passagem com um nível de rigor: devolve Map(índice da cara -> distância).
function runLevel(dq, level) {
  const faces = state.index.faces;
  const lim = (i, t) => (faces[i].px < SMALL_PX ? t - SMALL_PENALTY : t);
  const seeds = [];
  for (let i = 0; i < faces.length; i++) if (dq[i] < lim(i, SEED_DIST)) seeds.push(i);
  const found = new Map();
  if (!seeds.length) return found;
  for (const i of seeds) if (dq[i] < lim(i, level.direct)) found.set(i, dq[i]);
  let c = null;
  for (let it = 0; it < AQE_ITERS; it++) {
    const pool = it === 0 || !found.size ? seeds : [...found.keys()];
    let good = pool.filter((i) => faces[i].px >= GOOD_PX);
    if (!good.length) good = pool;
    const ref = c;
    const d0 = (i) => (ref ? distance(ref, faces[i].d) : dq[i]);
    const top = good.sort((a, b) => d0(a) - d0(b)).slice(0, AQE_TOP);
    const sum = new Float32Array(faces[0].d.length);
    for (const r of state.refs) for (let k = 0; k < sum.length; k++) sum[k] += r[k];
    for (const i of top) for (let k = 0; k < sum.length; k++) sum[k] += faces[i].d[k];
    c = normalize(sum);
    for (let i = 0; i < faces.length; i++) {
      const d = distance(c, faces[i].d);
      if (d < lim(i, level.t2)) found.set(i, Math.min(found.get(i) ?? Infinity, dq[i], d));
    }
  }
  return found;
}

function conflicts(found) {
  const faces = state.index.faces;
  const perPhoto = new Map();
  for (const i of found.keys()) perPhoto.set(faces[i].p, (perPhoto.get(faces[i].p) || 0) + 1);
  const n = perPhoto.size;
  return n ? [...perPhoto.values()].filter((v) => v > 1).length / n : 0;
}

function search() {
  if (!state.refs.length) { els.resultsCard.hidden = true; return; }
  const firstTime = els.resultsCard.hidden;
  const faces = state.index.faces;
  const dq = new Float32Array(faces.length);
  for (let i = 0; i < faces.length; i++) {
    let d = Infinity;
    for (const r of state.refs) d = Math.min(d, distance(r, faces[i].d));
    dq[i] = d;
  }
  const loose = runLevel(dq, LEVELS[0]);
  let main = loose;
  for (const level of LEVELS) {
    main = level === LEVELS[0] ? loose : runLevel(dq, level);
    if (conflicts(main) <= MAX_CONFLICTS) break;
  }
  const extra = new Map(loose);
  for (let i = 0; i < faces.length; i++) if (dq[i] < MAYBE_DIST && !extra.has(i)) extra.set(i, dq[i]);
  state.dq = dq;
  state.main = main;
  state.extra = extra;
  renderResults();
  if (firstTime) els.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Uma entrada por foto, com a cara mais parecida; score = −distância.
function collect(tier) {
  const { faces, photos } = state.index;
  const best = new Map();
  const add = (found) => {
    for (const [i, d] of found) {
      const cur = best.get(faces[i].p);
      if (!cur || -d > cur.score) best.set(faces[i].p, { face: faces[i], score: -d, kind: state.dq[i] < SEED_DIST ? 'seed' : 'link', photo: photos[faces[i].p] });
    }
  };
  add(state.main);
  if (tier === MAYBE_THRESHOLD) add(state.extra);
  return [...best.values()].sort((a, b) => b.score - a.score);
}

function showMaybe() {
  els.maybeGrid.replaceChildren(...state.maybe.map(renderCard));
  els.maybeGrid.hidden = false;
  els.maybeBox.hidden = true;
  // quem pediu "mais", leva-as também no zip
  state.hits = [...state.hits, ...state.maybe];
  const n = state.hits.length;
  els.zipNote.textContent = `Leva as ${n} provas num .zip (~${Math.max(1, Math.round(n * 0.8))} MB), incluindo as duvidosas.`;
}

function verdict(m) {
  if (m.kind === 'maybe') return { label: 'SERÁ?', cls: 'low' };
  if (-m.score < SURE_DIST) return { label: 'ÉS TU!', cls: 'high' };
  if (-m.score < LIKELY_DIST) return { label: 'PROVÁVEL', cls: 'mid' };
  return { label: 'TALVEZ', cls: 'low' };
}

function renderResults() {
  const hits = collect(THRESHOLD);
  els.resultsCard.hidden = false;
  els.resultsTitle.textContent = hits.length;
  els.nothing.hidden = hits.length > 0;
  setMsg(els.resultsMsg, hits.length
    ? 'As mais prováveis primeiro. Toca num fotograma para o ver maior.'
    : '');
  els.grid.replaceChildren(...hits.map(renderCard));
  const seen = new Set(hits.map((m) => m.face.p));
  // no máximo as 60 mais parecidas: quem cai num "hub" teria centenas de palpites fracos
  const maybe = collect(MAYBE_THRESHOLD).filter((m) => !seen.has(m.face.p)).slice(0, MAYBE_MAX).map((m) => ({ ...m, kind: 'maybe' }));
  state.maybe = maybe;
  els.maybeBox.hidden = !maybe.length;
  els.maybeGrid.hidden = true;
  els.maybeGrid.replaceChildren();
  els.maybeButton.textContent = `Mostrar mais ${maybe.length} foto${maybe.length === 1 ? '' : 's'} em que talvez estejas`;
  state.hits = hits;
  els.zipBox.hidden = !hits.length;
  if (!state.zipping) {
    els.zipButton.textContent = 'Vai, vai, Xinxers-zip!';
    const what = hits.length === 1 ? 'a prova' : `as ${hits.length} provas`;
    els.zipNote.textContent = `Leva ${what} num .zip (~${Math.max(1, Math.round(hits.length * 0.8))} MB). `
      + 'Os noivos já pagaram ao fotógrafo, por isso a ti sai de graça.';
  }
  return hits;
}

// ---------------------------------------------------------------- zip com as provas
// As fotos vêm do CDN da galeria (permite CORS) e o zip é montado no próprio telemóvel,
// em streaming, sem recomprimir os JPEG.
const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';
const ZIP_PARALLEL = 4;

const slug = (v) => v.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

function readme(hits) {
  const n = hits.length;
  const sure = hits.filter((m) => verdict(m).cls === 'high').length;
  return [
    'INSPECTOR XINXERS · RELATÓRIO DE PROVAS',
    'Casamento Inês & Ricardo · 5 de junho de 2026',
    '',
    `Provas recolhidas: ${n} fotografia${n === 1 ? '' : 's'} (${sure} com "és tu!" garantido).`,
    'Os ficheiros estão ordenados do mais certo para o menos certo.',
    '',
    'NOTAS DO INSPECTOR',
    '- As fotos marcadas "talvez" podem ser de um sósia. Nesse caso, parabéns: tens um gémeo no casamento.',
    '- Se apareces em mais fotos do que os noivos, a Inês e o Ricardo querem ter uma conversa contigo.',
    '- Os noivos disseram "sim" uma vez. Tu podes dizer "sim" a estas fotos quantas vezes quiseres.',
    '- O Ricardo pediu para lembrar que a noiva é a Inês. As fotos em que pareces mais apaixonado por ela do que ele serão investigadas.',
    '- Nenhum convidado foi interrogado. O inspector, esse, foi encontrado na horizontal no pátio.',
    '',
    'Caso encerrado.',
    'by Buildity.ai',
    '',
  ].join('\r\n');
}

async function downloadZip() {
  const hits = state.hits || [];
  if (!hits.length || state.zipping) return;
  state.zipping = true;
  els.zipButton.disabled = true;
  const say = (t) => { els.zipButton.textContent = t; };
  try {
    say('A carregar o camião…');
    const { Zip, ZipPassThrough, strToU8 } = await import(FFLATE);
    const parts = [];
    let failed = null;
    const zip = new Zip((err, chunk, final) => {
      if (err) { failed = err; return; }
      parts.push(chunk);
      if (final) {
        const url = URL.createObjectURL(new Blob(parts, { type: 'application/zip' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'provas-inspector-xinxers.zip';
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    });
    const add = (name, bytes) => {
      const f = new ZipPassThrough(name);
      zip.add(f);
      f.push(bytes, true);
    };
    add('LEIA-ME.txt', strToU8(readme(hits)));

    // descarrega em paralelo, mas junta ao zip pela ordem certa
    let done = 0, next = 0, missing = 0;
    const results = new Array(hits.length);
    let written = 0;
    const flush = () => {
      while (written < hits.length && results[written] !== undefined) {
        const bytes = results[written];
        if (bytes) add(`${String(written + 1).padStart(3, '0')}-${slug(verdict(hits[written]))}.jpg`, bytes);
        results[written] = null;
        written++;
      }
    };
    const worker = async () => {
      while (next < hits.length) {
        const i = next++;
        const m = hits[i];
        try {
          const res = await fetch(m.photo.f || m.photo.s, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          results[i] = new Uint8Array(await res.arrayBuffer());
        } catch {
          results[i] = false;
          missing++;
        }
        done++;
        say(`A empacotar provas… ${done}/${hits.length}`);
        flush();
      }
    };
    await Promise.all(Array.from({ length: ZIP_PARALLEL }, worker));
    flush();
    zip.end();
    if (failed) throw failed;
    say('Provas entregues!');
    els.zipNote.textContent = missing
      ? `${missing} foto${missing === 1 ? '' : 's'} fugiram à justiça (não descarregaram). As outras estão no zip.`
      : 'Está tudo no zip, com um relatório do inspector lá dentro.';
  } catch (e) {
    console.error(e);
    say('Vai, vai, Xinxers-zip!');
    els.zipNote.textContent = `O camião das provas avariou (${e.message}). Tenta outra vez com melhor rede.`;
  } finally {
    state.zipping = false;
    els.zipButton.disabled = false;
    setTimeout(() => { if (!state.zipping) els.zipButton.textContent = 'Vai, vai, Xinxers-zip!'; }, 4000);
  }
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

// ---- Vista grande em modo galeria: setas, deslizar com o dedo, teclado; pré-carrega as vizinhas.
// Navega pela lista que está no ecrã (provas e, se abertas, as "talvez"), pela mesma ordem.
function openLightbox(m) {
  const i = (state.hits || []).indexOf(m);
  showAt(i < 0 ? 0 : i, i < 0 ? [m] : null);
  if (!els.lightbox.open) els.lightbox.showModal();
}

function showAt(i, only = null) {
  const list = only || state.hits || [];
  if (!list.length) return;
  i = (i + list.length) % list.length;
  state.lbIndex = only ? -1 : i;
  const m = list[i];
  const v = verdict(m);
  const token = (state.lbToken = (state.lbToken || 0) + 1);
  els.lbImgWrap.style.setProperty('--r', m.photo.w / m.photo.h);
  els.lbImg.src = m.photo.t || m.photo.s;
  // Carrega a versão maior por cima, se existir (e se entretanto não se passou para outra foto).
  if (m.photo.f && m.photo.f !== els.lbImg.src) {
    const big = new Image();
    big.onload = () => { if (els.lightbox.open && state.lbToken === token) els.lbImg.src = big.src; };
    big.src = m.photo.f;
  }
  els.lbBox.replaceChildren(mark(m.photo, m.face.b, v.cls));
  const pos = list.length > 1 ? `${i + 1} / ${list.length} · ` : '';
  els.lbInfo.textContent = `${pos}▸ FOTOGRAMA ${frameNo(m)} · ${v.label}`;
  els.lbOpen.href = m.photo.f || m.photo.s;
  els.lbPrev.hidden = els.lbNext.hidden = list.length < 2;
  // pré-carregar as vizinhas para a navegação ser imediata
  for (const k of [i + 1, i - 1, i + 2]) {
    const n = list[(k + list.length) % list.length];
    if (n && n !== m) { new Image().src = n.photo.t || n.photo.s; if (n.photo.f) new Image().src = n.photo.f; }
  }
}

function stepLightbox(d) {
  if (state.lbIndex >= 0) showAt(state.lbIndex + d);
}

// deslizar com o dedo
let swipe = null;
els.lbImgWrap.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; });
els.lbImgWrap.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) stepLightbox(dx < 0 ? 1 : -1);
});
els.lbImgWrap.addEventListener('pointercancel', () => { swipe = null; });

// ---------------------------------------------------------------- o inspector em pessoa

const PEEK_LINES = ['Hmm… suspeito!', 'Deixa cá ver…', 'Vai, vai, Xinxers-lupa!', 'Elementar…'];
const KO_LINES = ['Zzz…', 'Hã? Já vou…', 'Só mais cinco minutos…', 'Quem apagou a luz?'];
const PEEK_MIN_MS = 1500;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// De madrugada (ou de vez em quando) o inspector ainda está a recuperar do copo-d'água.
const hungover = () => { const h = new Date().getHours(); return h < 6 || Math.random() < 1 / 6; };

// Enquanto a selfie é analisada, o inspector espreita no visor num braço de mola.
function showPeek() {
  const started = Date.now();
  const ko = hungover();
  els.peekImg.src = ko ? 'assets/inspector-ko-peek.jpg' : 'assets/inspector-peek.jpg';
  els.peekSays.textContent = pick(ko ? KO_LINES : PEEK_LINES);
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

const POSTERS = {
  wanted: {
    title: 'Procurado', img: 'assets/inspector.jpg', name: 'Inspector Xinxers', button: 'Vai, vai, fechar!',
    alt: 'O Inspector Xinxers, de chapéu, gabardina e lupa',
  },
  groom: {
    title: 'Cadastro', img: 'assets/noivo-mascarado.jpg', name: 'Suspeito: o noivo', button: 'Confesso!',
    alt: 'O noivo mascarado: óculos brancos enormes, bigode pintado, dente a menos, camisa havaiana e casaco branco',
  },
  report: {
    title: 'Ocorrência', img: 'assets/inspector-ko.jpg', name: 'Inspector fora de serviço', button: 'Deixá-lo dormir',
    alt: 'O inspector, de óculos escuros, deitado numa cadeira do pátio com os pés em cima da mesa',
    text: 'Casamento Inês & Ricardo, fim de tarde. Inspector encontrado em posição horizontal no pátio: óculos escuros à sombra, pés em cima da mesa, mãos cruzadas. Causa provável: copo-d’água. Estado: em recuperação.',
  },
};

function showPoster(kind, text) {
  const p = POSTERS[kind];
  els.wanted.className = `wanted ${kind}`;
  els.wantedTitle.textContent = p.title;
  els.wantedImg.src = p.img;
  els.wantedImg.alt = p.alt;
  els.wantedName.textContent = p.name;
  els.wantedText.textContent = text || p.text;
  els.wantedClose.textContent = p.button;
  if (!els.wanted.open) els.wanted.showModal();
}

const showWanted = (text) => showPoster('wanted', text);

function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

// Vai, vai, Xinxers-hélice: o chapéu levanta voo e volta.
function flyHat() {
  if (els.hat.classList.contains('fly')) return;
  els.hat.classList.add('fly');
  toast('Vai, vai, Xinxers-hélice!');
  setTimeout(() => els.hat.classList.remove('fly'), 2600);
}

// Três toques no chapéu: cartaz de procurado.
let hatTaps = [];
// ---- Easter eggs à espera de serem descobertos
// Cada um chama a atenção à vez (o chapéu abana, o carimbo carimba, o rastilho treme) até
// alguém lhe tocar; o telemóvel lembra-se dos que já foram descobertos.
const FOUND_KEY = 'xinxers-descobertos';
const found = new Set();
try { for (const k of JSON.parse(localStorage.getItem(FOUND_KEY) || '[]')) found.add(k); } catch {}

function discover(key) {
  found.add(key);
  try { localStorage.setItem(FOUND_KEY, JSON.stringify([...found])); } catch {}
  els.hatHint.hidden = found.has('hat');
}

const TEASERS = [['hat', () => els.hat], ['stamp', () => els.stamp], ['destruct', () => els.destruct]];
let teaseTurn = 0;
function tease() {
  if (document.hidden || document.querySelector('dialog[open]')) return;
  const waiting = TEASERS.filter(([key]) => !found.has(key));
  if (!waiting.length) return;
  const el = waiting[teaseTurn++ % waiting.length][1]();
  if (el.classList.contains('fast') || el.classList.contains('fly') || el.closest('.boom')) return;
  el.classList.remove('tease');
  void el.offsetWidth; // reinicia a animação
  el.classList.add('tease');
  setTimeout(() => el.classList.remove('tease'), 1100);
}

function tapHat() {
  discover('hat');
  els.hat.classList.remove('fast');
  void els.hat.offsetWidth; // reinicia a animação
  els.hat.classList.add('fast');
  clearTimeout(tapHat.t);
  tapHat.t = setTimeout(() => els.hat.classList.remove('fast'), 900);
  const now = Date.now();
  hatTaps = [...hatTaps.filter((t) => now - t < 1500), now];
  // 3 toques: cartaz; se continuar a tocar (6), o chapéu voa.
  clearTimeout(tapHat.wait);
  if (hatTaps.length >= 6) {
    hatTaps = [];
    flyHat();
  } else if (hatTaps.length >= 3) {
    tapHat.wait = setTimeout(() => {
      hatTaps = [];
      showWanted('Crime: fotografar o casamento inteiro. Recompensa: um copo no copo-d’água.');
    }, 700);
  }
}

// Palavras secretas no teclado: "xinxers" põe o chapéu a voar, "copo" abre a ocorrência.
let typed = '';
function secretWords(e) {
  if (e.key.length !== 1 || e.target.closest('input, textarea')) return;
  typed = (typed + e.key.toLowerCase()).slice(-12);
  if (typed.endsWith('xinxers')) { typed = ''; flyHat(); }
  if (typed.endsWith('copo')) { typed = ''; showPoster('report'); }
}

// A mensagem autodestrói-se (mais ou menos).
function selfDestruct() {
  discover('destruct');
  if (els.mission.classList.contains('boom')) return;
  els.mission.classList.add('boom');
  setTimeout(() => {
    els.mission.classList.add('singed');
    els.destruct.textContent = '…afinal era só fumo. A missão continua.';
  }, 1000);
}

// ---------------------------------------------------------------- menu de dossiês

function buildMenu() {
  els.menuList.replaceChildren(...DOSSIES.map((d) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `<span aria-hidden="true">${d.emoji}</span><span></span>`;
    b.lastChild.textContent = d.label;
    b.addEventListener('click', () => { toggleMenu(false); openDossie(d); });
    li.append(b);
    return li;
  }));
}

function toggleMenu(open = els.menuList.hidden) {
  els.menuList.hidden = !open;
  els.menuBtn.setAttribute('aria-expanded', String(open));
  if (open) els.menuList.querySelector('button')?.focus();
}

function openDossie(d) {
  if (d.action === 'ressaca') return ressaca();
  if (d.action === 'wanted') return showWanted(d.text);
  if (d.action === 'jogo') {
    const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return document.getElementById(d.target).scrollIntoView({ behavior: calmo ? 'auto' : 'smooth' });
  }
  els.pageTab.textContent = d.tab || 'Dossiê';
  els.pageTitle.textContent = d.title || d.label;
  els.pageBody.innerHTML = d.html; // conteúdo fixo do próprio site (dossies.js)
  els.page.showModal();
  // o foco vai para o botão "Arquivar", lá em baixo: volta ao início do dossiê
  els.pageTitle.focus({ preventScroll: true });
  els.page.scrollTop = 0;
}

// Modo ressaca: a página fica como o inspector no fim do copo-d'água, durante uns segundos.
function ressaca() {
  document.body.classList.add('ressaca');
  toast('Modo ressaca ativado. Bebe água.');
  clearTimeout(ressaca.t);
  ressaca.t = setTimeout(() => document.body.classList.remove('ressaca'), 7000);
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
els.lbClose.addEventListener('click', () => els.lightbox.close());
els.lbPrev.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
els.lbNext.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });
document.addEventListener('keydown', (e) => {
  if (!els.lightbox.open) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); }
});
els.hat.addEventListener('click', tapHat);
els.destruct.addEventListener('click', selfDestruct);
els.stamp.addEventListener('click', () => { discover('stamp'); showPoster('report'); });
els.koButton.addEventListener('click', () => showPoster('report'));
els.zipButton.addEventListener('click', downloadZip);
els.maybeButton.addEventListener('click', showMaybe);
els.menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (!els.menuList.hidden && !e.target.closest('.menu')) toggleMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.menuList.hidden) toggleMenu(false); });
els.pageClose.addEventListener('click', () => els.page.close());
els.page.addEventListener('click', (e) => { if (e.target === els.page) els.page.close(); });
buildMenu();
document.addEventListener('keydown', secretWords);
els.wantedClose.addEventListener('click', () => els.wanted.close());
els.wanted.addEventListener('click', (e) => { if (e.target === els.wanted) els.wanted.close(); });
els.lightbox.addEventListener('click', (e) => { if (e.target === els.lightbox) els.lightbox.close(); });

$('regrasBtn').addEventListener('click', () => openDossie(DOSSIES.find((d) => d.id === 'regulamento')));
$('regrasToquesBtn').addEventListener('click', () => openDossie(DOSSIES.find((d) => d.id === 'regulamento-toques')));
$('regrasSofaBtn').addEventListener('click', () => openDossie(DOSSIES.find((d) => d.id === 'regulamento-sofa')));
// Os jogos vivem à parte: se falharem, a pesquisa de fotos continua a funcionar.
import('./jogo.js').then((m) => m.initJogo($('jogo'))).catch((e) => console.warn('jogo:', e));
import('./toques.js').then((m) => m.initToques($('toques'))).catch((e) => console.warn('toques:', e));
import('./sofa.js').then((m) => m.initSofa($('sofa'))).catch((e) => console.warn('sofa:', e));

loadIndex();
els.hatHint.hidden = found.has('hat');
setInterval(tease, 3200);
loadInspector();
// Adianta o download dos modelos enquanto o convidado lê a página.
setTimeout(() => loadModels().catch(() => {}), 1500);
