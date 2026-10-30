import { appendFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The second tag run is the release's re-run: it finds every tag in place and changes nothing.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('tag-rehearsal-images.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');

  // the sandbox images first and nixie last, as the release tags them
  const refs = ['CONVERSATION', 'FETCH', 'WEB', 'NIXIE'].map((name) =>
    getStepEnv(process.env, name),
  );

  await $`bash .github/scripts/tag-images.sh 0.0.0-rehearsal ${refs}`;
  await $`bash .github/scripts/tag-images.sh 0.0.0-rehearsal ${refs}`;

  appendFileSync(
    summaryPath,
    [
      '| Image | Digest |',
      '| ----- | ------ |',
      ...refs.map((ref) => {
        const [image, digest] = ref.split('@');

        return `| \`${image ?? ''}\` | \`${digest ?? ''}\` |`;
      }),
      '',
    ].join('\n'),
  );
}

if (import.meta.main) {
  await runCLI();
}
