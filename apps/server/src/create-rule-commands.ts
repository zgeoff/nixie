import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createRuleCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['rules', (flags, io, args) => runRules(host, { flags, io, args })],
    ['proposals', (flags, io, args) => runProposals(host, { flags, io, args })],
  ];
}

interface CommandCall {
  readonly flags: CLIFlags;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

const rulesUsage = 'nixie rules takes list, conflicts, or resolve <rule ID> --keep nixie|repo';

async function runRules(host: HostTransport, call: CommandCall): Promise<number> {
  const [action, ruleID, ...extra] = call.args;

  if (action === 'list' && ruleID === undefined) {
    const socketPath = await host.resolveSocketPath(call.flags.config);

    const listed = await host.sendHostRequest(socketPath, 'rules list', (client) =>
      client.rules.list(),
    );

    call.io.print(JSON.stringify(listed));

    return 0;
  }

  if (action === 'conflicts' && ruleID === undefined) {
    const socketPath = await host.resolveSocketPath(call.flags.config);

    const conflicts = await host.sendHostRequest(socketPath, 'rules conflicts', (client) =>
      client.rules.conflicts(),
    );

    call.io.print(JSON.stringify(conflicts));

    return 0;
  }

  const keep = call.flags.keep;

  if (
    action !== 'resolve' ||
    ruleID === undefined ||
    extra.length > 0 ||
    (keep !== 'nixie' && keep !== 'repo')
  ) {
    call.io.print(rulesUsage);

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const resolved = await host.sendHostRequest(socketPath, 'rules resolve', (client) =>
    client.rules.resolve({ ruleID, keep }),
  );

  call.io.print(JSON.stringify(resolved));

  return 0;
}

const proposalsUsage =
  'nixie proposals takes list, approve <proposal ID>, or reject <proposal ID> --reason <why>';

async function runProposals(host: HostTransport, call: CommandCall): Promise<number> {
  const [action, proposalID, ...extra] = call.args;

  if (action === 'list' && proposalID === undefined) {
    const socketPath = await host.resolveSocketPath(call.flags.config);

    const pending = await host.sendHostRequest(socketPath, 'proposals list', (client) =>
      client.rules.proposals.list(),
    );

    call.io.print(JSON.stringify(pending));

    return 0;
  }

  if (proposalID === undefined || extra.length > 0) {
    call.io.print(proposalsUsage);

    return 2;
  }

  const reason = call.flags.reason;

  if (action === 'approve') {
    const socketPath = await host.resolveSocketPath(call.flags.config);

    const approved = await host.sendHostRequest(socketPath, 'proposals approve', (client) =>
      client.rules.proposals.approve({ proposalID }),
    );

    call.io.print(JSON.stringify(approved));

    return 0;
  }

  if (action !== 'reject' || reason === undefined) {
    call.io.print(proposalsUsage);

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const rejected = await host.sendHostRequest(socketPath, 'proposals reject', (client) =>
    client.rules.proposals.reject({ proposalID, reason }),
  );

  call.io.print(JSON.stringify(rejected));

  return 0;
}
