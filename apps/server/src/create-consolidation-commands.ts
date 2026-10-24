import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createConsolidationCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [
    ['memory-diff', (flags, io) => runMemoryDiff(host, flags.config, io)],
    ['memory-diff-approve', (flags, io, args) => runDiffApprove(host, { flags, io, args })],
    ['memory-diff-reject', (flags, io, args) => runDiffReject(host, { flags, io, args })],
  ];
}

async function runMemoryDiff(host: HostTransport, configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const diff = await host.sendHostRequest(socketPath, 'memory diff', (client) =>
    client.memory.consolidation.read(),
  );

  io.print(JSON.stringify(diff));

  return 0;
}

interface CommandCall {
  readonly flags: CLIFlags;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runDiffApprove(host: HostTransport, call: CommandCall): Promise<number> {
  const answers = call.args.map((arg) => parseChangeAnswer(arg));

  if (answers.length === 0 || answers.includes(null)) {
    call.io.print('nixie memory-diff-approve takes one or more <changeID>=<actionHash>');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const outcomes = await host.sendHostRequest(socketPath, 'memory diff-approve', (client) =>
    client.memory.consolidation.approve({
      answers: answers.filter((answer) => answer !== null),
    }),
  );

  call.io.print(JSON.stringify(outcomes));

  return 0;
}

function parseChangeAnswer(arg: string): { changeID: string; actionHash: string } | null {
  const at = arg.indexOf('=');

  return at < 1 || at === arg.length - 1
    ? null
    : { changeID: arg.slice(0, at), actionHash: arg.slice(at + 1) };
}

async function runDiffReject(host: HostTransport, call: CommandCall): Promise<number> {
  const [changeID] = call.args;
  const actionHash = call.flags.hash;

  if (changeID === undefined || actionHash === undefined || call.args.length > 1) {
    call.io.print('nixie memory-diff-reject takes a change ID and --hash <action hash>');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const rejected = await host.sendHostRequest(socketPath, 'memory diff-reject', (client) =>
    client.memory.consolidation.reject({ changeID, actionHash }),
  );

  call.io.print(JSON.stringify(rejected));

  return 0;
}
