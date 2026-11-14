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

  const modulesProbe =
    await $`docker run --rm --network none --entrypoint test ${conversation} -e /app/node_modules`
      .nothrow()
      .quiet();

  // `test -e` exits 1 for a missing path. Any other status is a Docker failure that proves nothing.
  if (modulesProbe.exitCode === 0) {
    console.log('::error::the conversation image holds /app/node_modules');

    process.exitCode = 1;
  } else if (modulesProbe.exitCode !== 1) {
    console.log('::error::the check for /app/node_modules did not run');

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
