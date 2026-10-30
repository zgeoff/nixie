import { appendFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { writeStepValues } from '../lib/write-step-values.ts';

// No commit holds the manifest, so the job hands it to the nixie image build as an output.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('record-sandbox-manifest.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const conversation = getStepEnv(process.env, 'CONVERSATION');
  const fetchImage = getStepEnv(process.env, 'FETCH');

  const manifest =
    await $`bash .github/scripts/build-sandbox-manifest.sh ${conversation} ${fetchImage}`.text();

  const json = manifest.trim();

  writeStepValues(getStepEnv(process.env, 'GITHUB_OUTPUT'), { json });
  appendFileSync(getStepEnv(process.env, 'GITHUB_STEP_SUMMARY'), `${json}\n`);
}

if (import.meta.main) {
  await runCLI();
}
