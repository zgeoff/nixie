import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createRuleCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['rules list', (flags, io) => runRulesList(host, flags, io)],
    ['rules conflicts', (flags, io) => runRuleConflicts(host, flags, io)],
    ['rules resolve', (flags, io) => runRuleResolve(host, flags, io)],
    ['proposals list', (flags, io) => runProposalsList(host, flags, io)],
    ['proposals approve', (flags, io) => runProposalApprove(host, flags, io)],
    ['proposals reject', (flags, io) => runProposalReject(host, flags, io)],
  ];
}

async function runRulesList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const listed = await host.sendHostRequest(socketPath, 'rules list', (client) =>
    client.rules.list(),
  );

  io.print(JSON.stringify(listed));

  return 0;
}

async function runRuleConflicts(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const conflicts = await host.sendHostRequest(socketPath, 'rules conflicts', (client) =>
    client.rules.conflicts(),
  );

  io.print(JSON.stringify(conflicts));

  return 0;
}

async function runRuleResolve(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const ruleID = flags.ruleID;
  const keep = flags.keep;

  invariant(ruleID !== undefined, 'the CLI parser requires a rule ID');
  invariant(keep === 'nixie' || keep === 'repo', 'the CLI parser requires --keep nixie or repo');

  const socketPath = await host.resolveSocketPath(flags.config);

  const resolved = await host.sendHostRequest(socketPath, 'rules resolve', (client) =>
    client.rules.resolve({ ruleID, keep }),
  );

  io.print(JSON.stringify(resolved));

  return 0;
}

async function runProposalsList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const pending = await host.sendHostRequest(socketPath, 'proposals list', (client) =>
    client.rules.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

async function runProposalApprove(
  host: HostTransport,
  flags: CLIFlags,
  io: CLIIO,
): Promise<number> {
  const proposalID = flags.proposalID;

  invariant(proposalID !== undefined, 'the CLI parser requires a proposal ID');

  const socketPath = await host.resolveSocketPath(flags.config);

  const approved = await host.sendHostRequest(socketPath, 'proposals approve', (client) =>
    client.rules.proposals.approve({ proposalID }),
  );

  io.print(JSON.stringify(approved));

  return 0;
}

async function runProposalReject(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const proposalID = flags.proposalID;
  const reason = flags.reason;

  invariant(proposalID !== undefined, 'the CLI parser requires a proposal ID');
  invariant(reason !== undefined, 'the CLI parser requires --reason');

  const socketPath = await host.resolveSocketPath(flags.config);

  const rejected = await host.sendHostRequest(socketPath, 'proposals reject', (client) =>
    client.rules.proposals.reject({ proposalID, reason }),
  );

  io.print(JSON.stringify(rejected));

  return 0;
}
