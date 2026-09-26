// Agrupa as caras de data/faces.json por pessoa e mostra quem aparece em mais fotos.
//
//   node people.mjs                 relatório: fotos por pessoa (+ género/idade se AGE_GENDER=1,
//                                   o que obriga a descarregar algumas fotos de cada pessoa)
//   GROOM=<n> node people.mjs       grava data/noivo.json com a pessoa n do relatório (1 = a
//                                   que aparece em mais fotos), usado pelo easter egg do noivo
//
// O agrupamento usa só as caras da galeria (mesma câmara e luz, por isso muito mais fiável do
// que comparar com uma selfie) e é determinístico, para dar o mesmo resultado em qualquer máquina.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpack, quantize } from './format.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(here, '../data/faces.json');
const GROOM_OUT = path.resolve(here, '../data/noivo.json');
const LINK = 0.33;        // distância máxima para ligar duas caras da galeria como a mesma pessoa
const TOP = +process.env.TOP || 8;
const TEMPLATE = 40;      // caras de referência gravadas para o noivo

const distance = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
};

// Chinese whispers sobre o grafo de caras próximas (em fotos diferentes), com ordem pseudo-aleatória fixa.
export function clusterPeople(faces, link = LINK) {
  const N = faces.length;
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (faces[i].p === faces[j].p) continue;
      const d = distance(faces[i].d, faces[j].d);
      if (d < link) { adj[i].push([j, 1 - d]); adj[j].push([i, 1 - d]); }
    }
  }
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const label = Int32Array.from({ length: N }, (_, i) => i);
  for (let it = 0; it < 30; it++) {
    const order = [...Array(N).keys()];
    for (let k = N - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [order[k], order[r]] = [order[r], order[k]]; }
    for (const i of order) {
      if (!adj[i].length) continue;
      const votes = new Map();
      for (const [j, w] of adj[i]) votes.set(label[j], (votes.get(label[j]) || 0) + w);
      let best = label[i], bw = -1;
      for (const [l, w] of votes) if (w > bw) { bw = w; best = l; }
      label[i] = best;
    }
  }
  const groups = new Map();
  label.forEach((l, i) => { if (!groups.has(l)) groups.set(l, []); groups.get(l).push(i); });
  return [...groups.values()]
    .map((members) => ({ members, photos: new Set(members.map((i) => faces[i].p)).size }))
    .sort((a, b) => b.photos - a.photos);
}

// Caras mais "centrais" do grupo: as que estão, em média, mais perto das outras.
function centralFaces(faces, members, n) {
  const sample = members.length > 400 ? members.filter((_, k) => k % Math.ceil(members.length / 400) === 0) : members;
  return members
    .map((i) => ({ i, m: sample.reduce((s, j) => s + distance(faces[i].d, faces[j].d), 0) / sample.length }))
    .sort((a, b) => a.m - b.m)
    .slice(0, n)
    .map((x) => x.i);
}

async function ageGender(photos, faces, members) {
  const faceapi = await import('@vladmandic/face-api');
  const tf = faceapi.tf;
  const dir = path.join(path.dirname(fileURLToPath(import.meta.resolve('@vladmandic/face-api'))), '../model');
  if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(dir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(dir);
    await faceapi.nets.ageGenderNet.loadFromDisk(dir);
  }
  // as maiores caras do grupo, uma por foto
  const seen = new Set();
  const pick = members
    .filter((i) => !seen.has(faces[i].p) && seen.add(faces[i].p))
    .sort((a, b) => faces[b].b[2] * photos[faces[b].p].w - faces[a].b[2] * photos[faces[a].p].w)
    .slice(0, 10);
  const out = [];
  for (const i of pick) {
    try {
      const r = await fetch(photos[faces[i].p].f);
      const img = tf.node.decodeImage(Buffer.from(await r.arrayBuffer()), 3);
      const [H, W] = img.shape;
      const [x, y, w, h] = faces[i].b;
      const m = 0.4;
      const x0 = Math.max(0, Math.round((x - w * m) * W)), y0 = Math.max(0, Math.round((y - h * m) * H));
      const x1 = Math.min(W, Math.round((x + w * (1 + m)) * W)), y1 = Math.min(H, Math.round((y + h * (1 + m)) * H));
      const crop = tf.slice(img, [y0, x0, 0], [y1 - y0, x1 - x0, 3]).toFloat();
      const det = await faceapi.detectSingleFace(crop, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withAgeAndGender();
      if (det) out.push({ male: det.gender === 'male' ? det.genderProbability : 1 - det.genderProbability, age: det.age });
      tf.dispose([img, crop]);
    } catch (e) { console.warn('  falhou uma foto:', e.message); }
  }
  if (!out.length) return '';
  const male = out.reduce((s, o) => s + o.male, 0) / out.length;
  const age = out.reduce((s, o) => s + o.age, 0) / out.length;
  return `homem ${(male * 100).toFixed(0)}% · ~${age.toFixed(0)} anos (${out.length} fotos)`;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(INDEX, 'utf8'));
  const { photos, faces } = unpack(raw);
  const t0 = Date.now();
  const people = clusterPeople(faces);
  console.log(`${faces.length} caras → ${people.length} grupos em ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

  const top = people.slice(0, TOP);
  // quem aparece com quem: os noivos aparecem muito juntos
  const photoSets = top.map((g) => new Set(g.members.map((i) => faces[i].p)));
  for (const [k, g] of top.entries()) {
    const together = photoSets.map((s, j) => (j === k ? '' : `${j + 1}:${[...photoSets[k]].filter((p) => s.has(p)).length}`)).filter(Boolean).join(' ');
    const ag = process.env.AGE_GENDER === '1' ? await ageGender(photos, faces, g.members) : '';
    console.log(`#${k + 1}  ${String(g.photos).padStart(4)} fotos  ${ag}\n     juntos com → ${together}`);
  }

  if (process.env.GROOM) {
    const g = people[+process.env.GROOM - 1];
    const ids = centralFaces(faces, g.members, TEMPLATE);
    await fs.writeFile(GROOM_OUT, JSON.stringify({ photos: g.photos, faces: ids.map((i) => quantize(faces[i].d)) }));
    console.log(`\n✓ ${path.relative(process.cwd(), GROOM_OUT)}: ${ids.length} caras de referência da pessoa #${process.env.GROOM}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
