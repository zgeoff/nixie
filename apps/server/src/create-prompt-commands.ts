import { z } from 'zod';
import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

export function createPromptCommands(): readonly (readonly [string, Command])[] {
  return [
    ['prompt-pending', (flags, io) => runPromptPending(flags.config, io)],
    ['prompt-approve', runPromptApprove],
    ['prompt-reject', runPromptReject],
  ];
}

async function runPromptPending(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const pending = await sendHostRequest(socketPath, 'prompt pending', (client) =>
    client.prompts.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

const filesSchema = z.array(z.object({ path: z.string(), text: z.string() }));
const entrySchema = z.record(z.string(), z.string());

async function runPromptApprove(
  flags: CLIFlags,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [proposalID] = args;
  const proposalHash = flags.hash;
  const files = flags.files === undefined ? undefined : parseJSONFlag(flags.files, filesSchema);
  const entry = flags.entry === undefined ? undefined : parseJSONFlag(flags.entry, entrySchema);

  if (proposalID === undefined || proposalHash === undefined || files === null || entry === null) {
    io.print(
      'nixie prompt-approve takes a proposal ID, --hash <proposal hash> and, for an edit, ' +
        '--entry <JSON map of part to file path, and _template> and ' +
        '--files <JSON list of path and text>',
    );

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const answer = await sendHostRequest(socketPath, 'prompt approve', (client) =>
    client.prompts.proposals.approve({
      proposalID,
      proposalHash,
      ...(entry === undefined ? {} : { entry }),
      ...(files === undefined ? {} : { files }),
    }),
  );

  io.print(JSON.stringify(answer));

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

async function runPromptReject(
  flags: CLIFlags,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [proposalID] = args;
  const proposalHash = flags.hash;
  const reason = flags.reason;

  if (proposalID === undefined || proposalHash === undefined || reason === undefined) {
    io.print('nixie prompt-reject takes a proposal ID, --hash <proposal hash> and --reason <why>');

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const answer = await sendHostRequest(socketPath, 'prompt reject', (client) =>
    client.prompts.proposals.reject({ proposalID, proposalHash, reason }),
  );

  io.print(JSON.stringify(answer));

  return 0;
}
