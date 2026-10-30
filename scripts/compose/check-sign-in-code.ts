import { $ } from 'bun';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// A code is two groups of five characters, which the enrol service prints on its first line.
const codePattern = /^[0-9A-Z]{5}-[0-9A-Z]{5}$/mu;

async function runCLI(): Promise<void> {
  const command = parseStepCommand(
    'check-sign-in-code.ts',
    [{ name: 'recipe', choices: ['recipe', 'preview'] }],
    process.argv.slice(2),
  );

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  // the recipe runs enrol on demand, and the preview starts it with the stack
  const output =
    command.values[0] === 'preview'
      ? await $`docker compose logs --no-log-prefix enrol`.cwd('preview').text()
      : await $`docker compose -f compose.yaml -f ci/compose.yaml run --rm enrol`
          .cwd('deploy/compose')
          .text();

  const code = codePattern.exec(output);

  if (code === null) {
    console.log('::error::enrol printed no sign-in code');

    process.exitCode = 1;

    return;
  }

  console.log(code[0]);
}

if (import.meta.main) {
  await runCLI();
}
