import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

export function createConsolidationCommands(): readonly (readonly [string, Command])[] {
  return [
    ['memory-diff', (flags, io) => runMemoryDiff(flags.config, io)],
    ['memory-diff-approve', runDiffApprove],
    ['memory-diff-reject', runDiffReject],
  ];
}

async function runMemoryDiff(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const diff = await sendHostRequest(socketPath, 'memory diff', (client) =>
    client.memory.consolidation.read(),
  );

  io.print(JSON.stringify(diff));

  return 0;
}

async function runDiffApprove(
  flags: CLIFlags,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const answers = args.map((arg) => parseChangeAnswer(arg));

  if (answers.length === 0 || answers.includes(null)) {
    io.print('nixie memory-diff-approve takes one or more <changeID>=<actionHash>');

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const outcomes = await sendHostRequest(socketPath, 'memory diff-approve', (client) =>
    client.memory.consolidation.approve({
      answers: answers.filter((answer) => answer !== null),
    }),
  );

  io.print(JSON.stringify(outcomes));

  return 0;
}

function parseChangeAnswer(arg: string): { changeID: string; actionHash: string } | null {
  const at = arg.indexOf('=');

  return at < 1 || at === arg.length - 1
    ? null
    : { changeID: arg.slice(0, at), actionHash: arg.slice(at + 1) };
}

async function runDiffReject(flags: CLIFlags, io: CLIIO, args: readonly string[]): Promise<number> {
  const [changeID] = args;

  if (changeID === undefined || flags.hash === undefined || args.length > 1) {
    io.print('nixie memory-diff-reject takes a change ID and --hash <action hash>');

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const actionHash = flags.hash;

  const rejected = await sendHostRequest(socketPath, 'memory diff-reject', (client) =>
    client.memory.consolidation.reject({ changeID, actionHash }),
  );

  io.print(JSON.stringify(rejected));

  return 0;
}
