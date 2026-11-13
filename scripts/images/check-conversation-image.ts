import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The conversation image holds the guest's bundles and the CLI, and nothing of the workspace, so
// the CLI runs and no node_modules folder sits beside the bundles.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-conversation-image.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const conversation = getStepEnv(process.env, 'CONVERSATION');

  await $`docker run --rm --network none --entrypoint /app/claude ${conversation} --version`;

  const hasModules =
    await $`docker run --rm --network none --entrypoint test ${conversation} -e /app/node_modules`
      .nothrow()
      .quiet();

  if (hasModules.exitCode === 0) {
    console.log('::error::the conversation image holds /app/node_modules');

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
