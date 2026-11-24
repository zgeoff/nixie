import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { imageNames, isImageName } from './image-names.ts';
import { pickImageSizeVerdict } from './pick-image-size-verdict.ts';

// Each image stays within its budget in image-size-budgets.ts. The step passes the image's
// reference through IMAGE. The registry holds the image, so the check pulls it first.
async function runCLI(): Promise<void> {
  const command = parseStepCommand(
    'check-image-size.ts',
    [{ choices: imageNames }],
    process.argv.slice(2),
  );

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const [image] = command.values;

  invariant(image !== undefined && isImageName(image), 'the command accepts only an image name');

  const reference = getStepEnv(process.env, 'IMAGE');

  await $`docker pull --quiet ${reference}`.quiet();

  const printed = await $`docker image inspect --format ${'{{.Size}}'} ${reference}`.text();

  const verdict = pickImageSizeVerdict(image, Number(printed.trim()));

  if (verdict !== null) {
    console.log(`::error::${verdict}`);

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
