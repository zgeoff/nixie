import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

// The skill host commands: they list the pending skill proposals as JSON, and answer one under the
// --hash skill-pending printed for it, an approval with the pull request that carries the skill and
// a rejection with the reason the conversation reads.
export function createSkillCommands(): readonly (readonly [string, Command])[] {
  return [
    ['skill-pending', (flags, io) => runSkillPending(flags.config, io)],
    ['skill-approve', runSkillApprove],
    ['skill-reject', runSkillReject],
  ];
}

async function runSkillPending(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const pending = await sendHostRequest(socketPath, 'skill pending', (client) =>
    client.skills.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

async function runSkillApprove(
  flags: CLIFlags,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [proposalID] = args;
  const skillHash = flags.hash;
  const pullRequestURL = flags['pull-request'];

  if (proposalID === undefined || skillHash === undefined || pullRequestURL === undefined) {
    io.print(
      'nixie skill-approve takes a proposal ID, --hash <skill hash> and --pull-request <url>',
    );

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const answer = await sendHostRequest(socketPath, 'skill approve', (client) =>
    client.skills.proposals.approve({ proposalID, skillHash, pullRequestURL }),
  );

  io.print(JSON.stringify(answer));

  return 0;
}

async function runSkillReject(
  flags: CLIFlags,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [proposalID] = args;
  const skillHash = flags.hash;
  const reason = flags.reason;

  if (proposalID === undefined || skillHash === undefined || reason === undefined) {
    io.print('nixie skill-reject takes a proposal ID, --hash <skill hash> and --reason <why>');

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const answer = await sendHostRequest(socketPath, 'skill reject', (client) =>
    client.skills.proposals.reject({ proposalID, skillHash, reason }),
  );

  io.print(JSON.stringify(answer));

  return 0;
}
