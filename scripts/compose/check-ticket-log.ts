import { $ } from 'bun';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { findTicketLogProblem } from './find-ticket-log-problem.ts';

const fixtureTicket = 'ticketFixture0123456789';

// With nixie stopped, the proxy answers each request with an error and writes the request address
// into its log, so the log shows whether a bearer ticket reaches it.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-ticket-log.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const origin = 'http://127.0.0.1:8080';

  await $`docker compose -f compose.yaml -f ci/compose.yaml stop nixie`.quiet();

  for (const path of [
    `/rpc/device/frames/${fixtureTicket}`,
    `/rpc/device/images/${fixtureTicket}`,
    `/rpc/computer/watch-stream?ticket=${fixtureTicket}`,
  ]) {
    await fetch(new URL(path, origin));
  }

  const log = await $`docker compose -f compose.yaml -f ci/compose.yaml logs --no-log-prefix proxy`
    .quiet()
    .text();

  const problem = findTicketLogProblem(log, fixtureTicket);

  if (problem !== null) {
    console.log(`::error::${problem}`);

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
