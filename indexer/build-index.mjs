// Inspector Xinxers — indexador offline.
//
// Percorre a galeria, deteta todas as caras de cada foto e grava os
// descritores faciais (128 floats por cara) em ../data/faces.json.
// A app web só compara a selfie com este ficheiro; nunca envia a selfie a lado nenhum.
//
// Fontes suportadas (escolhe uma, por variáveis de ambiente):
//   GALLERY_URL [+ GALLERY_PASSWORD]   galeria web, percorrida com um browser headless
//   URLS_FILE                          ficheiro de texto com um URL de imagem por linha
//   PHOTOS_DIR + PHOTO_BASE_URL        pasta local; o URL público é BASE + caminho relativo
//
// Opções:
//   OUT            ficheiro de saída (default ../data/index-arc.json)
//   MAX_SIDE       redimensiona antes de detetar (default 2048)
//   MIN_FACE       ignora caras menores que isto em px (default 36)
//   MIN_SCORE      confiança mínima do detetor (default 0.4)
//   TILES          1 = também deteta em 4 quadrantes, para caras pequenas em fotos de grupo (default 1)
//   THUMBS         1 = grava miniaturas (480px) em data/thumbs/ para a app as mostrar
//                  (necessário se as imagens da galeria só abrirem com sessão iniciada;
//                  atenção: ficam públicas no GitHub Pages)
//   LIMIT          processa só as primeiras N fotos (testes)
//   CHROMIUM_PATH  executável do Chromium, se não usares o do Playwright

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as faceapi from '@vladmandic/face-api';
import { pack, unpack, MODEL } from './format.mjs';
import * as ort from 'onnxruntime-node';
import { fivePoints, alignedInput, l2normalize, ARC_SIZE } from '../arcface.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const OUT = path.resolve(here, env.OUT || '../data/index-arc.json');
const DEBUG_DIR = path.resolve(here, 'debug');
const MAX_SIDE = +env.MAX_SIDE || 2048;
const MIN_FACE = +env.MIN_FACE || 36;
const MIN_SCORE = +env.MIN_SCORE || 0.4;
const TILES = (env.TILES ?? '1') !== '0';
const LIMIT = +env.LIMIT || Infinity;
const THUMBS = env.THUMBS === '1' || env.THUMBS === 'true';
const THUMB_DIR = path.join(path.dirname(OUT), 'thumbs');
const tf = faceapi.tf;

const IMG_RE = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;

// ---------------------------------------------------------------- recolha

async function collectFromGallery(url, password) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'pt-PT',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await fs.mkdir(DEBUG_DIR, { recursive: true });

  // Regista pedidos de imagens e de dados, para diagnóstico e como fonte alternativa.
  const netImages = new Map();
  const apiCalls = new Set();
  page.on('response', async (r) => {
    const type = r.headers()['content-type'] || '';
    const u = r.url();
    if (type.startsWith('image/') && !/svg/.test(type)) netImages.set(u, +(r.headers()['content-length'] || 0));
    else if (/json/.test(type)) apiCalls.add(`${new URL(u).host}${new URL(u).pathname}`);
  });

  console.log(`→ a abrir ${new URL(url).origin}${new URL(url).pathname}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 }).catch((e) => console.warn('  goto:', e.message));
  await page.waitForTimeout(2000);
  await describe(page, 'página inicial');
  if (password) await unlock(page, password);
  await page.screenshot({ path: path.join(DEBUG_DIR, '1-apos-login.png') });
  await describe(page, 'depois do login');

  const found = new Map(); // chave = URL da versão maior
  const harvest = async () => {
    for (const frame of page.frames()) {
      const items = await frame.evaluate(scrapeDom).catch(() => []);
      for (const item of items) {
        // A mesma foto aparece com vários tamanhos (?width=…): conta uma vez só.
        const key = photoKey(item.full || item.src);
        if (!found.has(key)) found.set(key, item);
      }
    }
  };
  await page.mouse.move(720, 600);
  let stale = 0;
  for (let round = 0; round < 600 && stale < 8; round++) {
    const before = found.size;
    await harvest();
    await clickLoadMore(page);
    // A roda do rato faz scroll no elemento debaixo do cursor, seja a janela ou um contentor interno.
    await page.mouse.wheel(0, 900);
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.9);
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight > el.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop += el.clientHeight * 0.9;
      }
    }).catch(() => {});
    await page.waitForTimeout(1000);
    stale = found.size === before ? stale + 1 : 0;
    if (round % 10 === 0) console.log(`  scroll ${round}: ${found.size} imagens`);
  }
  await harvest();

  await page.screenshot({ path: path.join(DEBUG_DIR, '2-fim-scroll.png') });
  await fs.writeFile(path.join(DEBUG_DIR, 'pagina.html'), await page.content());
  let items = [...found.values()].filter(looksLikePhoto).map((it) => ({ ...it, full: upsize(it.full) }));
  await fs.writeFile(path.join(DEBUG_DIR, 'imagens.json'), JSON.stringify(items, null, 2));

  console.log(`✓ ${items.length} fotos no DOM (${found.size} imagens no total), ${netImages.size} imagens na rede`);
  console.log('  chamadas JSON:', [...apiCalls].slice(0, 15).join('  ') || '(nenhuma)');
  console.log('  exemplos:', items.slice(0, 5).map((i) => `\n    src=${i.src}\n    full=${i.full} (${i.w}x${i.h})`).join(''));

  if (items.length < 3 && netImages.size) {
    console.log('  poucas fotos no DOM: a usar as imagens vistas na rede');
    items = [...netImages.entries()].filter(([u, size]) => !size || size > 30_000).map(([u]) => ({ src: u, full: u })).filter(looksLikePhoto);
  }

  // Os downloads usam o mesmo contexto, para herdar os cookies da sessão desbloqueada.
  const fetchBytes = async (u) => {
    const r = await ctx.request.get(u, { timeout: 120_000 });
    if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
    return r.body();
  };
  return { items, fetchBytes, close: () => browser.close() };
}

// Resumo em texto do estado da página, para perceber nos logs o que o browser está a ver.
async function describe(page, when) {
  const info = await page.evaluate(() => ({
    title: document.title,
    path: location.pathname,
    imgs: document.images.length,
    inputs: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).map((i) => `${i.type}[${i.name || i.id || i.placeholder || ''}]`),
    buttons: [...document.querySelectorAll('button, [role=button], input[type=submit]')].filter((b) => b.offsetParent).map((b) => (b.innerText || b.value || b.ariaLabel || '').trim().slice(0, 30)).filter(Boolean).slice(0, 12),
    scripts: [...new Set([...document.scripts].map((s) => { try { return new URL(s.src).host; } catch { return null; } }).filter(Boolean))],
    text: document.body?.innerText.replace(/\s+/g, ' ').slice(0, 300),
  })).catch((e) => ({ error: e.message }));
  console.log(`  [${when}] ${JSON.stringify(info)}`);
  console.log(`  [${when}] frames: ${page.frames().map((f) => { try { return new URL(f.url()).host; } catch { return '?'; } }).join(', ')}`);
}

const PASSWORD_SELECTOR = [
  'input[type=password]',
  'input[name*=pass i]', 'input[name*=senha i]', 'input[name*=pin i]', 'input[name*=code i]',
  'input[placeholder*=pass i]', 'input[placeholder*=senha i]', 'input[placeholder*=código i]', 'input[placeholder*=code i]',
].join(',');

async function findPasswordInput(page) {
  for (const frame of page.frames()) {
    const input = frame.locator(PASSWORD_SELECTOR).filter({ visible: true }).first();
    if (await input.count().catch(() => 0)) return { frame, input };
  }
  return null;
}

async function unlock(page, password) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const hit = await findPasswordInput(page);
    if (!hit) return;
    console.log('  campo de password encontrado, a desbloquear…');
    await hit.input.fill(password);
    const submit = hit.frame.locator('button[type=submit], input[type=submit], form button').filter({ visible: true }).first();
    if (await submit.count()) await submit.click().catch(() => hit.input.press('Enter'));
    else await hit.input.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  if (await findPasswordInput(page)) {
    throw new Error('A galeria continua a pedir password depois de 3 tentativas.');
  }
}

async function clickLoadMore(page) {
  const btn = page.getByRole('button', { name: /load more|show more|ver mais|carregar mais|mais fotos/i }).first();
  if (await btn.count().catch(() => 0)) await btn.click({ timeout: 2000 }).catch(() => {});
}

// Corre dentro da página. Devolve cada imagem visível com a melhor versão conhecida.
function scrapeDom() {
  const abs = (u) => { if (!u) return null; try { return new URL(u, location.href).href; } catch { return null; } };
  const largestFromSrcset = (ss) => {
    if (!ss) return null;
    let best = null, bestW = -1;
    for (const part of ss.split(',')) {
      const [u, d] = part.trim().split(/\s+/);
      const w = d ? parseFloat(d) * (d.endsWith('x') ? 1000 : 1) : 0;
      if (u && w > bestW) { best = u; bestW = w; }
    }
    return best && abs(best);
  };
  const isImg = (u) => u && /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u);
  const out = [];
  for (const img of document.querySelectorAll('img')) {
    const src = abs(img.currentSrc || img.src || img.dataset.src);
    if (!src || src.startsWith('data:')) continue;
    const a = img.closest('a');
    const href = a && isImg(a.href) ? a.href : null;
    const full = href || largestFromSrcset(img.srcset || img.dataset.srcset)
      || abs(img.dataset.full || img.dataset.original || img.dataset.large || img.dataset.src) || src;
    out.push({ src, full, w: img.naturalWidth, h: img.naturalHeight, alt: img.alt || '' });
  }
  for (const el of document.querySelectorAll('[style*="background-image"]')) {
    const m = /url\(["']?(.*?)["']?\)/.exec(el.style.backgroundImage);
    const src = m && abs(m[1]);
    if (src && !src.startsWith('data:')) out.push({ src, full: src, w: el.clientWidth, h: el.clientHeight, alt: '' });
  }
  return out;
}

const photoKey = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };

// CDNs de galerias (SmartAlbums/SmartSlides, imgix, …) redimensionam pelo URL.
// A grelha só carrega ~400px, pequeno demais para caras: pede-se uma versão grande.
function upsize(u, side = 2000) {
  try {
    const x = new URL(u);
    let changed = false;
    for (const k of ['width', 'height', 'w', 'h']) {
      if (x.searchParams.has(k)) { x.searchParams.set(k, String(side)); changed = true; }
    }
    return changed ? x.href : u;
  } catch { return u; }
}

function looksLikePhoto(it) {
  if (/\.svg|logo|icon|avatar|favicon|sprite/i.test(it.full)) return false;
  if (it.w && it.h && Math.max(it.w, it.h) < 150) return false;
  return true;
}

async function collectFromList(file) {
  const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return {
    items: lines.map((u) => ({ src: u, full: u })),
    fetchBytes: async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
    close: async () => {},
  };
}

async function collectFromDir(dir, base) {
  const files = [];
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (IMG_RE.test(e.name)) files.push(p);
    }
  };
  await walk(dir);
  files.sort();
  const byUrl = new Map();
  const items = files.map((p) => {
    const rel = path.relative(dir, p).split(path.sep).map(encodeURIComponent).join('/');
    const url = base.replace(/\/?$/, '/') + rel;
    byUrl.set(url, p);
    return { src: url, full: url };
  });
  return { items, fetchBytes: (u) => fs.readFile(byUrl.get(u)), close: async () => {} };
}

// ---------------------------------------------------------------- deteção

async function loadModels() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.resolve('@vladmandic/face-api'))), '../model');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(dir);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(dir);
  arc = await ort.InferenceSession.create(path.resolve(here, '../models/w600k_mbf.onnx'));
}

// ---------------------------------------------------------------- reconhecimento (ArcFace)
// A deteção e os 68 pontos continuam a ser do face-api; o descritor é o ArcFace (InsightFace
// w600k_mbf, 512 dimensões), média da cara alinhada e da mesma espelhada.
let arc = null;

function mirror(input) {
  const S = ARC_SIZE, out = new Float32Array(input.length);
  for (let c = 0; c < 3; c++) for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    out[c * S * S + v * S + u] = input[c * S * S + v * S + (S - 1 - u)];
  }
  return out;
}

export async function arcEmbedding(input) {
  const run = async (x) => (await arc.run({ [arc.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, ARC_SIZE, ARC_SIZE]) }))[arc.outputNames[0]].data;
  const a = await run(input), b = await run(mirror(input));
  return l2normalize(a.map((x, i) => x + b[i]));
}

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter);
};

async function detect(tensor) {
  const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE, maxResults: 200 });
  const run = async (t, dx, dy) => (await faceapi.detectAllFaces(t, opts).withFaceLandmarks())
    .map((r) => ({
      box: { x: r.detection.box.x + dx, y: r.detection.box.y + dy, width: r.detection.box.width, height: r.detection.box.height },
      score: r.detection.score,
      pts: r.landmarks.positions.map((q) => ({ x: q.x + dx, y: q.y + dy })),
    }));

  const [h, w] = tensor.shape;
  const faces = await run(tensor, 0, 0);
  // O SSD reduz a imagem a 512px: numa foto de grupo as caras pequenas desaparecem.
  // Passar também cada quadrante (com sobreposição) recupera-as.
  if (TILES && Math.max(w, h) > 1000) {
    const tw = Math.round(w * 0.6), th = Math.round(h * 0.6);
    for (const [x, y] of [[0, 0], [w - tw, 0], [0, h - th], [w - tw, h - th]]) {
      const tile = tf.slice(tensor, [y, x, 0], [th, tw, 3]);
      for (const f of await run(tile, x, y)) {
        if (!faces.some((g) => iou(g.box, f.box) > 0.3)) faces.push(f);
      }
      tile.dispose();
    }
  }
  const kept = faces.filter((f) => f.box.width >= MIN_FACE && f.box.height >= MIN_FACE);
  const px = await tensor.data();
  for (const f of kept) f.descriptor = await arcEmbedding(alignedInput(px, w, h, 3, fivePoints(f.pts)));
  return kept;
}

function decode(bytes) {
  return tf.tidy(() => {
    let t = tf.node.decodeImage(bytes, 3);
    const [h, w] = t.shape;
    const s = MAX_SIDE / Math.max(w, h);
    if (s < 1) t = tf.image.resizeBilinear(t, [Math.round(h * s), Math.round(w * s)]);
    return t.toFloat();
  });
}

async function writeThumb(tensor, key) {
  const [h, w] = tensor.shape;
  const s = Math.min(1, 480 / Math.max(w, h));
  const jpg = await tf.tidy(() => tf.image.resizeBilinear(tensor, [Math.round(h * s), Math.round(w * s)]).clipByValue(0, 255).toInt())
    .data().then(async (px) => {
      const t = tf.tensor3d(px, [Math.round(h * s), Math.round(w * s), 3], 'int32');
      const out = await tf.node.encodeJpeg(t, 'rgb', 78);
      t.dispose();
      return out;
    });
  const name = createHash('sha1').update(key).digest('hex').slice(0, 16) + '.jpg';
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.writeFile(path.join(THUMB_DIR, name), jpg);
  return 'data/thumbs/' + name;
}

// Avisa se as imagens só abrem com a sessão da galeria (nesse caso a app não as consegue mostrar).
async function checkPublic(items) {
  const u = items[0]?.src;
  if (!u || !/^https?:/.test(u) || THUMBS) return;
  try {
    const r = await fetch(u, { method: 'GET', redirect: 'follow' });
    const ok = r.ok && (r.headers.get('content-type') || '').startsWith('image/');
    if (!ok) console.warn(`\n⚠ As imagens não abrem sem sessão (HTTP ${r.status}). A app não as vai conseguir mostrar: corre com THUMBS=1.\n`);
    else console.log('  imagens acessíveis publicamente ✓');
  } catch (e) { console.warn('  não consegui verificar acesso público:', e.message); }
}

const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- main

async function main() {
  let source, label;
  if (env.GALLERY_URL) { source = await collectFromGallery(env.GALLERY_URL, env.GALLERY_PASSWORD); label = new URL(env.GALLERY_URL).host; }
  else if (env.URLS_FILE) { source = await collectFromList(env.URLS_FILE); label = path.basename(env.URLS_FILE); }
  else if (env.PHOTOS_DIR && env.PHOTO_BASE_URL) { source = await collectFromDir(env.PHOTOS_DIR, env.PHOTO_BASE_URL); label = env.PHOTO_BASE_URL; }
  else throw new Error('Define GALLERY_URL, URLS_FILE ou PHOTOS_DIR+PHOTO_BASE_URL.');

  // Reaproveita resultados anteriores: só as fotos novas são processadas.
  const cache = new Map();
  try {
    const prevRaw = JSON.parse(await fs.readFile(OUT, 'utf8'));
    // Só se reaproveita um índice feito com o mesmo modelo de reconhecimento.
    if (prevRaw.model !== MODEL) throw new Error('outro modelo');
    const prev = unpack(prevRaw);
    const byPhoto = prev.photos.map(() => []);
    for (const f of prev.faces) byPhoto[f.p]?.push(f);
    prev.photos.forEach((p, i) => cache.set(p.f, { photo: p, faces: byPhoto[i] }));
  } catch {}

  await tf.ready();
  await loadModels();
  const items = source.items.slice(0, LIMIT);
  if (!items.length) throw new Error('Nenhuma foto encontrada (ver indexer/debug/).');
  await checkPublic(items);

  const photos = [], faces = [];
  let failed = 0;
  const t0 = Date.now();
  // Grava o que já está feito (+ o que vem da cache para as fotos seguintes), para que um run
  // interrompido não perca trabalho: o próximo retoma a partir daqui.
  let processed = 0;
  const save = async (upto) => {
    const P = photos.slice(), F = faces.slice();
    for (const it of items.slice(upto)) {
      const hit = cached(it);
      if (!hit) continue;
      const p = P.length;
      P.push({ ...hit.photo, s: it.src });
      for (const f of hit.faces) F.push({ ...f, p });
    }
    const out = pack({ source: label, photos: P, faces: F });
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT + '.tmp', JSON.stringify(out));
    await fs.rename(OUT + '.tmp', OUT);
  };
  let current = 0;
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, async () => {
      console.warn(`\n${sig}: a gravar ${photos.length} fotos antes de sair…`);
      await save(current).catch(() => {});
      process.exit(130);
    });
  }

  // Descarrega à frente (em paralelo) enquanto a deteção corre sobre a foto atual.
  const cached = (it) => { const hit = cache.get(it.full); return hit && (!THUMBS || hit.photo.t) ? hit : null; };
  const download = async (it) => {
    try { return await source.fetchBytes(it.full); }
    catch (e) { if (it.full === it.src) throw e; const b = await source.fetchBytes(it.src); it.full = it.src; return b; }
  };
  const pending = new Map();
  const AHEAD = 6;
  const prefetch = (k) => {
    for (let j = k; j < Math.min(items.length, k + AHEAD); j++) {
      if (!pending.has(j) && !cached(items[j])) {
        const pr = download(items[j]);
        pr.catch(() => {});
        pending.set(j, pr);
      }
    }
  };

  for (const [i, it] of items.entries()) {
    current = i;
    const p = photos.length;
    const hit = cached(it);
    if (hit) {
      photos.push({ ...hit.photo, s: it.src });
      for (const f of hit.faces) faces.push({ ...f, p });
      continue;
    }
    prefetch(i);
    try {
      const pr = pending.get(i);
      pending.delete(i);
      const bytes = await pr;
      const tensor = decode(bytes);
      const [h, w] = tensor.shape;
      const found = await detect(tensor);
      const photo = { s: it.src, f: it.full, w, h };
      if (THUMBS) photo.t = await writeThumb(tensor, it.full);
      tensor.dispose();
      photos.push(photo);
      for (const f of found) {
        faces.push({ p, b: [r3(f.box.x / w), r3(f.box.y / h), r3(f.box.width / w), r3(f.box.height / h)], d: f.descriptor });
      }
      console.log(`[${i + 1}/${items.length}] ${found.length} cara(s)  ${it.full.slice(-60)}`);
      if (++processed % 100 === 0) {
        await save(i + 1);
        console.log(`  ↳ progresso gravado (${photos.length} fotos, ${((Date.now() - t0) / 1000 / processed).toFixed(1)}s/foto)`);
      }
    } catch (e) {
      failed++;
      console.warn(`[${i + 1}/${items.length}] falhou: ${e.message}  ${it.full.slice(-60)}`);
    }
  }
  await source.close();

  await save(items.length);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n✓ ${photos.length} fotos, ${faces.length} caras, ${failed} falhas, ${secs}s → ${path.relative(process.cwd(), OUT)}`);
  if (failed && failed === items.length) process.exit(1);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
