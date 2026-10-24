import type { HostContractInputs } from '@heynixie/contract';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createMemoryCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['memory-pending', (flags, io) => runMemoryPending(host, flags.config, io)],
    ['memory-approve', makeMemoryAnswer(host, 'approve')],
    ['memory-reject', makeMemoryAnswer(host, 'reject')],
    [
      'memory-show',
      (flags, io, args) => runMemoryShow(host, { configPath: flags.config, io, args }),
    ],
    ['memory-edit', (flags, io, args) => runMemoryEdit(host, { flags, io, args })],
    ['memory-retire', makeMemoryVersionChange(host, 'retire')],
    ['memory-restore', makeMemoryVersionChange(host, 'restore')],
    ['memory-forget', makeMemoryVersionChange(host, 'forget')],
    ['memory-pin', makeMemoryPin(host, true)],
    ['memory-unpin', makeMemoryPin(host, false)],
  ];
}

async function runMemoryPending(
  host: HostTransport,
  configPath: string,
  io: CLIIO,
): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const pending = await host.sendHostRequest(socketPath, 'memory pending', (client) =>
    client.memory.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

function makeMemoryAnswer(host: HostTransport, command: 'approve' | 'reject'): Command {
  return async (flags, io, args) => {
    const request = buildAnswerRequest(command, args[0], flags);

    if (request === null) {
      const options =
        command === 'approve'
          ? ', then --text <edited text>, and --revise <itemID>@<version> or --as-new'
          : ', then --reason <why>';

      io.print(`nixie memory-${command} takes a proposal ID and --hash <action hash>${options}`);

      return 2;
    }

    const socketPath = await host.resolveSocketPath(flags.config);

    const answer = await host.sendHostRequest<unknown>(socketPath, `memory ${command}`, (client) =>
      request.command === 'reject'
        ? client.memory.proposals.reject(request.answer)
        : client.memory.proposals.approve(request.answer),
    );

    io.print(JSON.stringify(answer));

    return 0;
  };
}

type AnswerRequest =
  | {
      readonly command: 'approve';
      readonly answer: HostContractInputs['memory']['proposals']['approve'];
    }
  | {
      readonly command: 'reject';
      readonly answer: HostContractInputs['memory']['proposals']['reject'];
    };

function buildAnswerRequest(
  command: 'approve' | 'reject',
  proposalID: string | undefined,
  flags: CLIFlags,
): AnswerRequest | null {
  const revisionOf = flags.revise === undefined ? undefined : parseVersionTarget(flags.revise);

  if (proposalID === undefined || flags.hash === undefined || revisionOf === null) {
    return null;
  }

  if (command === 'reject') {
    return flags.text === undefined
      ? {
          command,
          answer: {
            proposalID,
            actionHash: flags.hash,
            ...(flags.reason === undefined ? {} : { reason: flags.reason }),
          },
        }
      : null;
  }

  return flags.reason === undefined
    ? {
        command,
        answer: {
          proposalID,
          actionHash: flags.hash,
          ...(revisionOf === undefined ? {} : { revisionOf }),
          ...(flags['as-new'] ? { ignoreCloseMatch: true } : {}),
          ...(flags.text === undefined ? {} : { editedText: flags.text }),
        },
      }
    : null;
}

function parseVersionTarget(flag: string): { itemID: string; version: number } | null {
  const at = flag.lastIndexOf('@');
  const version = flag.slice(at + 1);

  return at < 1 || !/^[1-9]\d*$/u.test(version)
    ? null
    : { itemID: flag.slice(0, at), version: Number(version) };
}

interface MemoryShowCall {
  readonly configPath: string;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runMemoryShow(host: HostTransport, call: MemoryShowCall): Promise<number> {
  const [itemID] = call.args;

  if (itemID === undefined) {
    call.io.print('nixie memory-show takes an item ID');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.configPath);

  const history = await host.sendHostRequest(socketPath, 'memory show', (client) =>
    client.memory.items.read({ itemID }),
  );

  call.io.print(JSON.stringify(history));

  return 0;
}

interface MemoryEditCall {
  readonly flags: CLIFlags;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runMemoryEdit(host: HostTransport, call: MemoryEditCall): Promise<number> {
  const [flag] = call.args;
  const target = flag === undefined ? null : parseVersionTarget(flag);
  const text = call.flags.text;

  if (target === null || text === undefined) {
    call.io.print('nixie memory-edit takes <itemID>@<version> and --text <new text>');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.flags.config);

  const ref = await host.sendHostRequest(socketPath, 'memory edit', (client) =>
    client.memory.items.edit({ ...target, text }),
  );

  call.io.print(JSON.stringify(ref));

  return 0;
}

function makeMemoryVersionChange(
  host: HostTransport,
  command: 'retire' | 'restore' | 'forget',
): Command {
  return async (flags, io, args) => {
    const [flag] = args;
    const target = flag === undefined ? null : parseVersionTarget(flag);

    if (target === null) {
      io.print(`nixie memory-${command} takes <itemID>@<version>`);

      return 2;
    }

    const socketPath = await host.resolveSocketPath(flags.config);

    const ref = await host.sendHostRequest(socketPath, `memory ${command}`, (client) =>
      client.memory.items[command](target),
    );

    io.print(JSON.stringify(ref));

    return 0;
  };
}

function makeMemoryPin(host: HostTransport, isPinned: boolean): Command {
  return async (flags, io, args) => {
    const [itemID] = args;

    if (itemID === undefined) {
      io.print(`nixie memory-${isPinned ? 'pin' : 'unpin'} takes an item ID`);

      return 2;
    }

    const socketPath = await host.resolveSocketPath(flags.config);

    const pinned = await host.sendHostRequest(socketPath, 'memory pin', (client) =>
      client.memory.items.pin({ itemID, isPinned }),
    );

    io.print(JSON.stringify(pinned));

    return 0;
  };
}
