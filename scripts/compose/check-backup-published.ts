import { appendFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const composeFiles = ['-f', 'compose.yaml', '-f', 'ci/compose.yaml'];
const publishedEvent = '"backup.set_published"';

// nixie stages a set at start, the backup container ships it, and nixie records its receipt on its
// next pass, within its poll, so the check reads nixie's log until a published set shows.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-backup-published.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const pollMs = Number(process.env['POLL_MS'] ?? '5000');
  const reads = Number(process.env['READS'] ?? '60');

  for (const read of Array.from({ length: reads }, (_, index) => index)) {
    if (read > 0) {
      await Bun.sleep(pollMs);
    }

    const log = await $`docker compose ${composeFiles} logs --no-color nixie`
      .cwd('deploy/compose')
      .text();

    const published = log.split('\n').filter((line) => line.includes(publishedEvent));

    if (published.length > 0) {
      const lines = `${published.join('\n')}\n`;

      process.stdout.write(lines);

      appendFileSync(summaryPath, lines);

      return;
    }
  }

  console.log(
    `::error::nixie recorded no published backup set within ${String((reads * pollMs) / 1000)} s`,
  );

  process.exitCode = 1;
}

if (import.meta.main) {
  await runCLI();
}
