import { join } from 'node:path';
import { sqliteWorkerEntry } from '@heynixie/db';
import { testBuildIDs } from './test-build-ids';

export interface ReleaseBundle {
  readonly files: readonly string[];

  readonly testBuildIDs: readonly string[];
}

export async function writeReleaseBundle(
  outdir: string,
  isTestBuild = false,
): Promise<ReleaseBundle> {
  const result = await Bun.build({
    // Bun's bundler does not follow a Worker's URL, so the SQLite worker is an entry of its own.
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
