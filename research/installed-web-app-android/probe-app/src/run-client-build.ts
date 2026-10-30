import { basename, join } from 'node:path';

const clientDirectory = join(import.meta.dir, '..', 'client');

export const pageEntries = ['home', 'block-1', 'block-2', 'block-6', 'block-7', 'log', 'send'];

// Bundles the service worker and each page's script in memory at start, keyed by the path the
// browser asks for: the service worker at the root, so its scope covers every page.
export async function runClientBuild(): Promise<Map<string, Blob>> {
  const result = await Bun.build({
    entrypoints: [
      join(clientDirectory, 'sw.ts'),
      ...pageEntries.map((name) => join(clientDirectory, 'pages', `${name}.ts`)),
    ],
    target: 'browser',
    format: 'esm',
    naming: '[name].[ext]',
  });
  const assets = new Map<string, Blob>();

  for (const output of result.outputs) {
    const name = basename(output.path);

    assets.set(name === 'sw.js' ? name : `assets/${name}`, output);
  }

  return assets;
}
