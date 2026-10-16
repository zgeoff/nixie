import { join } from 'node:path';
import { sqliteWorkerEntry } from '@heynixie/db';
import { testBuildIDs } from './test-build-ids';

export interface ReleaseBundle {
  // the server's entry, main.js, beside sqlite-worker.js, which the database starts as its worker
  readonly files: readonly string[];

  // every test-build ID the bundle holds, which the release build refuses
  readonly testBuildIDs: readonly string[];
}

// Bundles the server as the release does, with NIXIE_TEST_BUILD false so the bundler drops every
// branch behind it. The SQLite worker is its own entry, as Bun's bundler does not follow a
// Worker's URL. isTestBuild bundles a test build, which shows the ID list still matches the code.
export async function buildReleaseBundle(
  outdir: string,
  isTestBuild = false,
): Promise<ReleaseBundle> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'main.ts'), sqliteWorkerEntry],
    outdir,
    naming: '[name].[ext]',
    target: 'bun',

    // a bundle cannot inline a native addon, so the image carries the package beside the bundle
    external: ['onnxruntime-node'],
    define: { NIXIE_TEST_BUILD: String(isTestBuild) },
  });

  // Bun.build throws on a failed build, so every result here is a success
  const texts = await Promise.all(result.outputs.map((output) => output.text()));

  const text = texts.join('\n');

  return {
    files: result.outputs.map((output) => output.path.slice(outdir.length + 1)).toSorted(),
    testBuildIDs: testBuildIDs.filter((id) => text.includes(id)),
  };
}
