import { appendFileSync } from 'node:fs';
import { sandboxImageKeys } from '../../modules/sandbox/src/sandbox-image-keys.ts';
import { buildSandboxManifest } from '../lib/build-sandbox-manifest.ts';
import { collectKeyOutputs } from '../lib/collect-key-outputs.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { writeStepValues } from '../lib/write-step-values.ts';

// No commit holds the manifest, so the job hands it to the nixie image build as an output. The
// job's needs hold one entry per image job, named by the image key, and each gives its ref as an
// output.
function runCLI(): void {
  const command = parseStepCommand('record-sandbox-manifest.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const json = buildSandboxManifest(
    collectKeyOutputs(getStepEnv(process.env, 'NEEDS'), sandboxImageKeys, 'ref'),
  );

  writeStepValues(getStepEnv(process.env, 'GITHUB_OUTPUT'), { json });
  appendFileSync(getStepEnv(process.env, 'GITHUB_STEP_SUMMARY'), `${json}\n`);
}

if (import.meta.main) {
  runCLI();
}
