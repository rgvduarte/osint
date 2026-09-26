// Formato de data/faces.json.
//
// v2 (atual), compacto para o telemóvel:
//   base:   prefixo comum a todos os URLs de fotos
//   photos: [s, f | 0, w, h, t?]        s/f sem o prefixo; f = 0 quando é igual a s
//   faces:  [p, x, y, w, h, escala, q, μ, σ]
//           caixa em frações da foto; q = base64 de 128 int8, descritor ≈ q * escala
//           (erro de distância ~0,001); μ/σ = média e desvio das distâncias desta cara às
//           200 mais próximas de uma coorte fixa da galeria, para normalizar a pontuação
//           (S-norm) na app: caras "genéricas", parecidas com toda a gente, contam menos.
// v1 (antigo): photos [{s, f, w, h, t}], faces [{p, b, d}] com d = base64 de 128 float32.

export const MODEL = 'face-api ssdMobilenetv1 + faceRecognitionNet (128d)';

// Coorte para a S-norm: tem de ser igual à da app (app.js, cohortStats).
export const COHORT_SIZE = 800;
export const COHORT_TOP = 200;

const distance = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
};

export function cohortOf(descriptors) {
  const step = Math.max(1, Math.floor(descriptors.length / COHORT_SIZE));
  const out = [];
  for (let i = 0; i < descriptors.length; i += step) out.push(descriptors[i]);
  return out;
}

export function cohortStats(d, cohort) {
  const ds = cohort.map((c) => distance(d, c)).filter((x) => x > 1e-6).sort((a, b) => a - b).slice(0, COHORT_TOP);
  const mean = ds.reduce((s, x) => s + x, 0) / ds.length;
  const sd = Math.sqrt(ds.reduce((s, x) => s + (x - mean) ** 2, 0) / ds.length) || 1;
  return [mean, sd];
}

// {photos: [{s, f, w, h, t?}], faces: [{p, b, d: Float32Array}]} -> JSON v2
export function pack({ source, photos, faces }) {
  const base = commonDir(photos.flatMap((p) => [p.s, p.f]));
  const cut = (u) => (u.startsWith(base) ? u.slice(base.length) : u);
  return {
    app: 'Inspector Xinxers',
    version: 2,
    generatedAt: new Date().toISOString(),
    source,
    model: MODEL,
    base,
    photos: photos.map((p) => {
      const row = [cut(p.s), p.f === p.s ? 0 : cut(p.f), p.w, p.h];
      if (p.t) row.push(p.t);
      return row;
    }),
    faces: withStats(faces.map((f) => ({ ...f, row: [f.p, ...f.b, ...quantize(f.d)] }))),
  };
}

// As estatísticas usam os descritores já quantizados, tal como a app os vê.
function withStats(items) {
  const ds = items.map((it) => dequantize(it.row[5], it.row[6]));
  const cohort = cohortOf(ds);
  return items.map((it, i) => {
    const [mean, sd] = cohortStats(ds[i], cohort);
    return [...it.row, +mean.toFixed(4), +sd.toFixed(4)];
  });
}

// JSON v1 ou v2 -> {photos, faces} com descritores Float32Array
export function unpack(json) {
  if (json.version === 2) {
    const base = json.base || '';
    return {
      photos: json.photos.map(([s, f, w, h, t]) => ({ s: base + s, f: base + (f || s), w, h, ...(t ? { t } : {}) })),
      faces: json.faces.map(([p, x, y, w, h, scale, q]) => ({ p, b: [x, y, w, h], d: dequantize(scale, q) })),
    };
  }
  return {
    photos: json.photos,
    faces: json.faces.map((f) => {
      const buf = Buffer.from(f.d, 'base64');
      return { p: f.p, b: f.b, d: new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4) };
    }),
  };
}

export function quantize(d) {
  let max = 0;
  for (const x of d) max = Math.max(max, Math.abs(x));
  const scale = max / 127 || 1;
  const q = Int8Array.from(d, (x) => Math.round(x / scale));
  return [+scale.toPrecision(6), Buffer.from(q.buffer).toString('base64')];
}

function dequantize(scale, b64) {
  const buf = Buffer.from(b64, 'base64');
  return Float32Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length), (x) => x * scale);
}

// Maior prefixo comum, cortado no último '/'.
function commonDir(urls) {
  if (!urls.length) return '';
  let pre = urls[0];
  for (const u of urls) while (!u.startsWith(pre)) pre = pre.slice(0, -1);
  return pre.slice(0, pre.lastIndexOf('/') + 1);
}
