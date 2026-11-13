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

// Both kinds of proposal list together, each with the sentence that says what it would change.
async function runProposalsList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const pending = await host.sendHostRequest(socketPath, 'proposals list', async (client) => {
    const rules = await client.rules.proposals.list();
    const actions = await client.actions.proposals.list();

    return { rules, actions };
  });

  const entries = [...pending.rules.map(toRuleEntry), ...pending.actions.map(toActionEntry)];

  io.print(JSON.stringify(entries));

  return 0;
}

interface ListedRuleChange {
  readonly ruleID: string;
  readonly after: { readonly sentence: string } | null;
}

interface ListedRuleProposal {
  readonly changes: readonly ListedRuleChange[];
}

function toRuleEntry<Proposal extends ListedRuleProposal>(proposal: Proposal) {
  const sentence = proposal.changes
    .map((change) => `${change.ruleID}: ${change.after?.sentence ?? 'removed'}`)
    .join('\n');

  return { kind: 'rule_change' as const, ...proposal, sentence };
}

function toActionEntry<Proposal extends object>(proposal: Proposal) {
  return { kind: 'action' as const, ...proposal };
}

async function runProposalApprove(
  host: HostTransport,
  flags: CLIFlags,
  io: CLIIO,
): Promise<number> {
  const proposalID = flags.proposalID;

  invariant(proposalID !== undefined, 'the CLI parser requires a proposal ID');

  const socketPath = await host.resolveSocketPath(flags.config);

  const approved = await host.sendHostRequest(socketPath, 'proposals approve', async (client) => {
    const actions = await client.actions.proposals.list();

    return actions.some((action) => action.proposalID === proposalID)
      ? client.actions.proposals.approve({ proposalID })
      : client.rules.proposals.approve({ proposalID });
  });

  io.print(JSON.stringify(approved));

  return 0;
}

async function runProposalReject(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const proposalID = flags.proposalID;
  const reason = flags.reason;

  invariant(proposalID !== undefined, 'the CLI parser requires a proposal ID');

  const socketPath = await host.resolveSocketPath(flags.config);

  const rejected = await host.sendHostRequest(socketPath, 'proposals reject', async (client) => {
    const actions = await client.actions.proposals.list();

    if (actions.some((action) => action.proposalID === proposalID)) {
      return client.actions.proposals.reject({
        proposalID,
        ...(reason === undefined ? {} : { reason }),
      });
    }

    if (reason === undefined) {
      throw new Error('a rule change proposal needs --reason to reject it');
    }

    return client.rules.proposals.reject({ proposalID, reason });
  });

  io.print(JSON.stringify(rejected));

  return 0;
}
