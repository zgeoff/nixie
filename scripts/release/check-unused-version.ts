import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const images = ['nixie-conversation', 'nixie-fetch', 'nixie', 'nixie-web'];

// A tagged image may already be pinned, and a rebuild would give its tag another digest; the tag
// stage refuses that too, and this stops the run before it builds anything.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-unused-version.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const owner = getStepEnv(process.env, 'OWNER');
  const version = getStepEnv(process.env, 'VERSION');

  for (const image of images) {
    const ref = `ghcr.io/${owner}/${image}:${version}`;

    const inspected = await $`docker buildx imagetools inspect ${ref}`.nothrow().quiet();

    if (inspected.exitCode === 0) {
      console.log(`::error::${ref} already exists, so the release refuses to rebuild it`);

      process.exitCode = 1;

      return;
    }
  }
}

if (import.meta.main) {
  await runCLI();
}
