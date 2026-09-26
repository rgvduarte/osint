// Reescreve data/faces.json no formato atual (ver format.mjs), sem voltar a indexar.
//   node repack.mjs [ficheiro]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack, unpack } from './format.mjs';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.argv[2] || '../data/faces.json');
const json = JSON.parse(await fs.readFile(file, 'utf8'));
const before = (await fs.stat(file)).size;
const out = pack({ source: json.source, ...unpack(json) });
out.generatedAt = json.generatedAt;
await fs.writeFile(file, JSON.stringify(out));
const after = (await fs.stat(file)).size;
console.log(`${out.photos.length} fotos, ${out.faces.length} caras: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
