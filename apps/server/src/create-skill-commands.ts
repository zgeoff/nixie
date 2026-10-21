import { z } from 'zod';
import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

// The skill host commands, each printing JSON: list and answer the pending skill proposals under
// the --hash skill-pending printed, and list the skills nixie wrote that are in force and keep
// nixie's or your definitions' version of one.
export function createSkillCommands(): readonly (readonly [string, Command])[] {
  return [
    ['skill-pending', (flags, io) => runSkillPending(flags.config, io)],
    ['skill-approve', runSkillApprove],
    ['skill-reject', runSkillReject],
    ['skill-written', (flags, io) => runSkillWritten(flags.config, io)],
    ['skill-resolve', runSkillResolve],
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
  const files = flags.files === undefined ? undefined : parseFiles(flags.files);

  if (proposalID === undefined || skillHash === undefined || files === null) {
    io.print(
      'nixie skill-approve takes a proposal ID, --hash <skill hash> and, for an edit, ' +
        '--files <JSON list of path and text>',
    );

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const answer = await sendHostRequest(socketPath, 'skill approve', (client) =>
    client.skills.proposals.approve({
      proposalID,
      skillHash,
      ...(files === undefined ? {} : { files }),
    }),
  );

  io.print(JSON.stringify(answer));

  return 0;
}

const filesSchema = z.array(z.object({ path: z.string(), text: z.string() })).min(1);

function parseFiles(text: string): { path: string; text: string }[] | null {
  try {
    const parsed = filesSchema.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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

async function runSkillWritten(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const written = await sendHostRequest(socketPath, 'skill written', (client) =>
    client.skills.written.list(),
  );

  io.print(JSON.stringify(written));

  return 0;
}

async function runSkillResolve(
  flags: CLIFlags,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [approvalID, ...extra] = args;
  const keep = flags.keep;

  // the parser holds --keep to its choices, and the command takes one word, the approval ID
  if (approvalID === undefined || extra.length > 0 || keep === undefined) {
    io.print('nixie skill-resolve takes an approval ID and --keep nixie|definitions');

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const resolved = await sendHostRequest(socketPath, 'skill resolve', (client) =>
    client.skills.written.resolve({ approvalID, keep }),
  );

  io.print(JSON.stringify(resolved));

  return 0;
}
