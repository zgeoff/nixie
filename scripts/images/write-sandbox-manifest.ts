import { writeFileSync } from 'node:fs';
import {
  sandboxImageKeys,
  sandboxImageRecords,
} from '../../modules/sandbox/src/sandbox-image-keys.ts';
import { buildSandboxManifest } from '../lib/build-sandbox-manifest.ts';
import { collectKeyOutputs } from '../lib/collect-key-outputs.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The nixie image build copies the manifest from the checkout, so it carries the sandbox digests.
// The step's context holds one entry per step, and each build step whose id is an image key gives
// its digest as an output.
function runCLI(): void {
  const command = parseStepCommand('write-sandbox-manifest.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const digests = collectKeyOutputs(getStepEnv(process.env, 'STEPS'), sandboxImageKeys, 'digest');
  const registry = getStepEnv(process.env, 'REGISTRY');

  const refs = Object.fromEntries(
    sandboxImageKeys.flatMap((key) => {
      const digest = digests[key];

      return digest === undefined
        ? []
        : [[key, `${registry}/${sandboxImageRecords[key].repository}@${digest}`]];
    }),
  );

  const manifest = `${buildSandboxManifest(refs)}\n`;

  writeFileSync('apps/server/sandbox-manifest.json', manifest);

  process.stdout.write(manifest);
}

if (import.meta.main) {
  runCLI();
}
