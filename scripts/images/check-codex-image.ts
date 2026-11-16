import { $ } from 'bun';
import { codexVersion } from '../../guests/codex/src/codex-version.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The codex image holds one CLI version, and the guest refuses any other.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-codex-image.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const codex = getStepEnv(process.env, 'CODEX');

  const printed =
    await $`docker run --rm --network none --entrypoint codex ${codex} --version`.text();

  if (printed.trim() !== `codex-cli ${codexVersion}`) {
    console.log(
      `::error::the codex image prints "${printed.trim()}", not codex-cli ${codexVersion}`,
    );

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
