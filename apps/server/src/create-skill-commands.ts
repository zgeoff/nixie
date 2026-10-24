import { z } from 'zod';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createSkillCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['skill-pending', (flags, io) => runSkillPending(host, flags.config, io)],
    ['skill-approve', (flags, io, args) => runSkillApprove(host, { flags, io, args })],
    ['skill-reject', (flags, io, args) => runSkillReject(host, { flags, io, args })],
    ['skill-written', (flags, io) => runSkillWritten(host, flags.config, io)],
    ['skill-resolve', (flags, io, args) => runSkillResolve(host, { flags, io, args })],
  ];
}

async function runSkillPending(
  host: HostTransport,
  configPath: string,
  io: CLIIO,
): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const pending = await host.sendHostRequest(socketPath, 'skill pending', (client) =>
    client.skills.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

interface CommandCall {
  readonly flags: CLIFlags;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runSkillApprove(host: HostTransport, call: CommandCall): Promise<number> {
  const [proposalID] = call.args;
  const skillHash = call.flags.hash;
  const files = call.flags.files === undefined ? undefined : parseFiles(call.flags.files);

  if (proposalID === undefined || skillHash === undefined || files === null) {
    call.io.print(
      'nixie skill-approve takes a proposal ID, --hash <skill hash> and, for an edit, ' +
        '--files <JSON list of path and text>',
    );

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const answer = await host.sendHostRequest(socketPath, 'skill approve', (client) =>
    client.skills.proposals.approve({
      proposalID,
      skillHash,
      ...(files === undefined ? {} : { files }),
    }),
  );

  call.io.print(JSON.stringify(answer));

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

async function runSkillReject(host: HostTransport, call: CommandCall): Promise<number> {
  const [proposalID] = call.args;
  const skillHash = call.flags.hash;
  const reason = call.flags.reason;

  if (proposalID === undefined || skillHash === undefined || reason === undefined) {
    call.io.print('nixie skill-reject takes a proposal ID, --hash <skill hash> and --reason <why>');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const answer = await host.sendHostRequest(socketPath, 'skill reject', (client) =>
    client.skills.proposals.reject({ proposalID, skillHash, reason }),
  );

  call.io.print(JSON.stringify(answer));

  return 0;
}

async function runSkillWritten(
  host: HostTransport,
  configPath: string,
  io: CLIIO,
): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const written = await host.sendHostRequest(socketPath, 'skill written', (client) =>
    client.skills.written.list(),
  );

  io.print(JSON.stringify(written));

  return 0;
}

async function runSkillResolve(host: HostTransport, call: CommandCall): Promise<number> {
  const [approvalID, ...extra] = call.args;
  const keep = call.flags.keep;

  if (approvalID === undefined || extra.length > 0 || keep === undefined) {
    call.io.print('nixie skill-resolve takes an approval ID and --keep nixie|definitions');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const resolved = await host.sendHostRequest(socketPath, 'skill resolve', (client) =>
    client.skills.written.resolve({ approvalID, keep }),
  );

  call.io.print(JSON.stringify(resolved));

  return 0;
}
