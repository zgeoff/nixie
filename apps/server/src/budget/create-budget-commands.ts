import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createBudgetCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['budgets list', (flags, io) => runBudgetsList(host, flags, io)],
    ['budgets ledger', (flags, io) => runBudgetsLedger(host, flags, io)],
  ];
}

async function runBudgetsList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const listed = await host.sendHostRequest(socketPath, 'budgets list', (client) =>
    client.budgets.list(),
  );

  io.print(JSON.stringify(listed));

  return 0;
}

async function runBudgetsLedger(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const budgetID = flags.budgetID;

  invariant(budgetID !== undefined, 'the CLI parser requires a budget ID');

  const socketPath = await host.resolveSocketPath(flags.config);

  const ledger = await host.sendHostRequest(socketPath, 'budgets ledger', (client) =>
    client.budgets.ledger({ budgetID }),
  );

  io.print(JSON.stringify(ledger));

  return 0;
}
