import { appendFileSync } from 'node:fs';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

// The recipe's origin answers nixie's ready check and the web client's page.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-health-url.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const origin = getStepEnv(process.env, 'ORIGIN');
  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');

  const ready = await readPage(new URL('/health/ready', origin));

  if (ready === null) {
    process.exitCode = 1;

    return;
  }

  console.log(ready);

  appendFileSync(summaryPath, ready);

  if ((await readPage(new URL('/', origin))) === null) {
    process.exitCode = 1;
  }
}

async function readPage(url: URL): Promise<string | null> {
  // as curl does by default, a redirect is the answer, never a hop to another page
  const response = await fetch(url, { redirect: 'manual' });
  const body = await response.text();

  if (response.status >= 400) {
    console.log(`::error::${url.href} answered ${String(response.status)}`);

    return null;
  }

  return body;
}

if (import.meta.main) {
  await runCLI();
}
