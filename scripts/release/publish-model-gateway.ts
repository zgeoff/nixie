import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// A host that runs the model gateway outside a container pins this binary by its sha256.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('publish-model-gateway.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const tag = getStepEnv(process.env, 'TAG');
  const binaryPath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'model-gateway-linux-x64');

  await $`bun build --compile --target=bun-linux-x64 --define NIXIE_TEST_BUILD=false apps/model-gateway/src/main.ts --outfile ${binaryPath}`;

  // --clobber, because a re-run replaces the binary of an earlier attempt
  await $`gh release upload ${tag} ${binaryPath} --clobber`;

  const digest = new Bun.CryptoHasher('sha256').update(readFileSync(binaryPath)).digest('hex');

  appendFileSync(
    getStepEnv(process.env, 'GITHUB_STEP_SUMMARY'),
    `model-gateway-linux-x64 sha256: ${digest}\n`,
  );
}

if (import.meta.main) {
  await runCLI();
}
