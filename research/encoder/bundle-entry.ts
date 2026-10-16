// The image's shape in one file: bundled with `bun build`, run from another folder with no
// node_modules, the model read from a pinned local folder and no network access. Pass the candidate
// ID as the first argument.
import { CANDIDATES } from './candidates.ts';
import { loadEncoder } from './load-encoder.ts';

const candidate = CANDIDATES.find((entry) => entry.id === process.argv[2]);
if (!candidate) {
  throw new Error(`unknown candidate ${process.argv[2]}`);
}
const embed = await loadEncoder(candidate);
const [vector] = await embed([`${candidate.queryPrefix}where does my sister live now`]);
console.log(`${candidate.id}: ${vector?.length} dims, first value ${vector?.[0]?.toFixed(4)}`);
// list the native libraries the process mapped, to show where the runtime came from
const maps = await Bun.file('/proc/self/maps').text();
const libraries = new Set(maps.split('\n').map((line) => line.split(/\s+/u).at(-1) ?? '').filter((file) => /onnx|\.node$|tokenizers/u.test(file)));
console.log([...libraries].join('\n') || 'no native library mapped');
