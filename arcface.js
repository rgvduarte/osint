// Alinhamento facial para ArcFace (InsightFace), partilhado pela app e pelo indexador.
//
// Os 5 pontos (olhos, nariz, cantos da boca) vêm dos 68 pontos do face-api e são levados, por
// uma transformação de similaridade (Umeyama), para o molde 112×112 com que o ArcFace foi
// treinado. O resultado é o tensor [1, 3, 112, 112] normalizado que o modelo espera.

export const ARC_SIZE = 112;

// Molde de referência do InsightFace para 112×112 (arcface_dst).
const TEMPLATE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// 68 pontos (lista de {x, y}) -> 5 pontos, na ordem do molde.
export function fivePoints(pts) {
  const mean = (a, b) => {
    let x = 0, y = 0;
    for (let i = a; i <= b; i++) { x += pts[i].x; y += pts[i].y; }
    const n = b - a + 1;
    return [x / n, y / n];
  };
  return [mean(36, 41), mean(42, 47), [pts[30].x, pts[30].y], [pts[48].x, pts[48].y], [pts[54].x, pts[54].y]];
}

// Similaridade (escala + rotação + translação) de mínimos quadrados src -> dst (Umeyama 2D).
// Devolve [a, b, tx, ty]: x' = a·x − b·y + tx ; y' = b·x + a·y + ty
function similarity(src, dst) {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - sx, ay = src[i][1] - sy;
    const bx = dst[i][0] - dx, by = dst[i][1] - dy;
    num1 += ax * bx + ay * by;
    num2 += ax * by - ay * bx;
    den += ax * ax + ay * ay;
  }
  const a = num1 / den, b = num2 / den;
  return [a, b, dx - (a * sx - b * sy), dy - (b * sx + a * sy)];
}

// pixels: RGB ou RGBA (channels = 3 ou 4), largura w, altura h; pts5 em coordenadas da imagem.
export function alignedInput(pixels, w, h, channels, pts5) {
  const [a, b, tx, ty] = similarity(pts5, TEMPLATE);
  // inversa: da saída (u, v) para a imagem (x, y)
  const det = a * a + b * b;
  const ia = a / det, ib = -b / det;
  const S = ARC_SIZE, plane = S * S;
  const out = new Float32Array(3 * plane);
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const px = u - tx, py = v - ty;
      const x = ia * px - ib * py;
      const y = ib * px + ia * py;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const o = v * S + u;
      for (let c = 0; c < 3; c++) {
        const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : pixels[(yy * w + xx) * channels + c]);
        const val = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy)
          + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
        out[c * plane + o] = (val - 127.5) / 127.5;
      }
    }
  }
  return out;
}

export function l2normalize(v) {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return Float32Array.from(v, (x) => x / s);
}
