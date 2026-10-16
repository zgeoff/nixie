// The pinned download: `bun adapters/encoder-onnx/src/run-pinned-download.ts <list> <outdir>`
// writes each file the list names into outdir after checking its SHA-256, and exits 1 on a file
// that differs, so the image build stops before it holds a model the repo never pinned.
import { writePinnedFiles } from './write-pinned-files';

const [listPath, outDir] = process.argv.slice(2);

if (listPath === undefined || outDir === undefined) {
  process.stderr.write('usage: run-pinned-download.ts <list> <outdir>\n');
  process.exit(2);
}

try {
  const listText = await Bun.file(listPath).text();
  const written = await writePinnedFiles(listText, outDir);

  process.stdout.write(`checked and wrote ${written.join(', ')}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
