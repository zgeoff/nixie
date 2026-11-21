import { join } from 'node:path';
import { readTestTemplate } from '@heynixie/testing';
import { buildGatewayCompileArgs } from '../build-gateway-compile-args';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// A compile takes longer than a test's limit, so the bundle lane's start hook fills the template
// before its tests start, and each suite reads it.
export async function readModelGatewayBinary(): Promise<string> {
  const directory = await readTestTemplate({
    name: 'nixie-model-gateway',
    root: repoRoot,
    inputs: [
      'apps/model-gateway/src/**/*',
      'modules/*/src/**/*',
      'libs/*/src/**/*',
      '*/*/package.json',
      'bun.lock',
    ],
    write: async (building) => {
      const entry = join(repoRoot, 'apps', 'model-gateway', 'src', 'main.ts');

      const build = Bun.spawn(
        [process.execPath, ...buildGatewayCompileArgs(entry, join(building, 'model-gateway'))],
        { stdin: 'ignore', stdout: 'ignore', stderr: 'inherit' },
      );

      const code = await build.exited;

      if (code !== 0) {
        throw new Error(`the gateway binary build exited with ${String(code)}`);
      }
    },
  });

  return join(directory, 'model-gateway');
}

if (import.meta.main) {
  await readModelGatewayBinary();
}
