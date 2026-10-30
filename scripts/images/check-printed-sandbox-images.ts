import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { sandboxImagesSchema } from '../../apps/server/src/sandbox-images-schema.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const manifestPath = 'apps/server/sandbox-manifest.json';

// A deployment's scripts run the nixie command on the image's PATH, with no network, to learn the
// sandbox images and the name each one takes on the host.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-printed-sandbox-images.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const nixie = getStepEnv(process.env, 'NIXIE');
  const printedPath = join(getStepEnv(process.env, 'RUNNER_TEMP'), 'printed.json');

  const printed =
    await $`docker run --rm --network none --read-only --entrypoint nixie ${nixie} sandbox-manifest`.text();

  writeFileSync(printedPath, printed);

  process.stdout.write(printed);

  const images = Object.entries(sandboxImagesSchema.parse(JSON.parse(printed))).map(
    ([kind, image]) => ({ kind, name: image.name, ref: image.ref }),
  );

  const writtenManifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const refs = Object.fromEntries(images.map((image) => [image.kind, image.ref]));

  if (!Bun.deepEquals(refs, writtenManifest)) {
    console.log(`::error::nixie prints other sandbox images than ${manifestPath}`);

    process.exitCode = 1;

    return;
  }

  const misnamed = images.filter(
    (image) => !new RegExp(`^nixie-${image.kind}-[0-9a-f]{12}$`, 'u').test(image.name),
  );

  if (misnamed.length > 0) {
    console.log(
      `::error::nixie names a sandbox image other than nixie-<kind>-<12 hex digits>: ${misnamed.map((image) => image.name).join(', ')}`,
    );

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
