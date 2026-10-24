import { z } from 'zod';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createPromptCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['prompt-pending', (flags, io) => runPromptPending(host, flags.config, io)],
    ['prompt-approve', (flags, io, args) => runPromptApprove(host, { flags, io, args })],
    ['prompt-reject', (flags, io, args) => runPromptReject(host, { flags, io, args })],
  ];
}

async function runPromptPending(
  host: HostTransport,
  configPath: string,
  io: CLIIO,
): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const pending = await host.sendHostRequest(socketPath, 'prompt pending', (client) =>
    client.prompts.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

interface CommandCall {
  readonly flags: CLIFlags;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

const filesSchema = z.array(z.object({ path: z.string(), text: z.string() }));
const entrySchema = z.record(z.string(), z.string());

async function runPromptApprove(host: HostTransport, call: CommandCall): Promise<number> {
  const flags = call.flags;
  const [proposalID] = call.args;
  const proposalHash = flags.hash;
  const files = flags.files === undefined ? undefined : parseJSONFlag(flags.files, filesSchema);
  const entry = flags.entry === undefined ? undefined : parseJSONFlag(flags.entry, entrySchema);

  if (proposalID === undefined || proposalHash === undefined || files === null || entry === null) {
    call.io.print(
      'nixie prompt-approve takes a proposal ID, --hash <proposal hash> and, for an edit, ' +
        '--entry <JSON map of part to file path, and _template> and ' +
        '--files <JSON list of path and text>',
    );

    return 2;
  }

  const socketPath = await host.resolveSocketPath(flags.config);

  const answer = await host.sendHostRequest(socketPath, 'prompt approve', (client) =>
    client.prompts.proposals.approve({
      proposalID,
      proposalHash,
      ...(entry === undefined ? {} : { entry }),
      ...(files === undefined ? {} : { files }),
    }),
  );

  call.io.print(JSON.stringify(answer));

  return 0;
}

function parseJSONFlag<Schema extends z.ZodType>(
  text: string,
  schema: Schema,
): z.output<Schema> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function runPromptReject(host: HostTransport, call: CommandCall): Promise<number> {
  const flags = call.flags;
  const [proposalID] = call.args;
  const proposalHash = flags.hash;
  const reason = flags.reason;

  if (proposalID === undefined || proposalHash === undefined || reason === undefined) {
    call.io.print(
      'nixie prompt-reject takes a proposal ID, --hash <proposal hash> and --reason <why>',
    );

    return 2;
  }

  const socketPath = await host.resolveSocketPath(flags.config);

  const answer = await host.sendHostRequest(socketPath, 'prompt reject', (client) =>
    client.prompts.proposals.reject({ proposalID, proposalHash, reason }),
  );

  call.io.print(JSON.stringify(answer));

  return 0;
}
