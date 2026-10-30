import { writeFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The nixie image build copies the manifest from the checkout, so it carries the sandbox digests.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('write-sandbox-manifest.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const conversation = getStepEnv(process.env, 'CONVERSATION');
  const fetchImage = getStepEnv(process.env, 'FETCH');

  const manifest =
    await $`bash .github/scripts/build-sandbox-manifest.sh ${conversation} ${fetchImage}`.text();

  writeFileSync('apps/server/sandbox-manifest.json', manifest);

  process.stdout.write(manifest);
}

if (import.meta.main) {
  await runCLI();
}
