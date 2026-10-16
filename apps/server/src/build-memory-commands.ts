import type { HostContractInputs } from '@heynixie/contract';
import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

// The memory host commands: they list the pending memory proposals as JSON or answer one under
// --hash, and show one item or change it as your own action, a forget for good included.
export function buildMemoryCommands(): readonly (readonly [string, Command])[] {
  return [
    ['memory-pending', (flags, io) => runMemoryPending(flags.config, io)],
    ['memory-approve', makeMemoryAnswer('approve')],
    ['memory-reject', makeMemoryAnswer('reject')],
    ['memory-show', (flags, io, args) => runMemoryShow(flags.config, io, args)],
    ['memory-edit', runMemoryEdit],
    ['memory-retire', makeMemoryVersionChange('retire')],
    ['memory-restore', makeMemoryVersionChange('restore')],
    ['memory-forget', makeMemoryVersionChange('forget')],
    ['memory-pin', makeMemoryPin(true)],
    ['memory-unpin', makeMemoryPin(false)],
  ];
}

async function runMemoryPending(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const pending = await sendHostRequest(socketPath, 'memory pending', (client) =>
    client.memory.proposals.list(),
  );

  io.print(JSON.stringify(pending));

  return 0;
}

// the answer takes the proposal's ID and the action hash that memory-pending printed for it
function makeMemoryAnswer(command: 'approve' | 'reject'): Command {
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

    const socketPath = await resolveSocketPath(flags.config);

    const answer = await sendHostRequest<unknown>(socketPath, `memory ${command}`, (client) =>
      request.command === 'reject'
        ? client.memory.proposals.reject(request.answer)
        : client.memory.proposals.approve(request.answer),
    );

    io.print(JSON.stringify(answer));

    return 0;
  };
}

// An answer's request: an approval or a rejection, each with the input its procedure takes.
type AnswerRequest =
  | {
      readonly command: 'approve';
      readonly answer: HostContractInputs['memory']['proposals']['approve'];
    }
  | {
      readonly command: 'reject';
      readonly answer: HostContractInputs['memory']['proposals']['reject'];
    };

// the request an answer sends, or null when its arguments are malformed; only an approval takes
// --revise, --as-new or --text, and only a rejection takes --reason
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

// prints an item with its state and every version, oldest first
async function runMemoryShow(
  configPath: string,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [itemID] = args;

  if (itemID === undefined) {
    io.print('nixie memory-show takes an item ID');

    return 2;
  }

  const socketPath = await resolveSocketPath(configPath);

  const history = await sendHostRequest(socketPath, 'memory show', (client) =>
    client.memory.items.read({ itemID }),
  );

  io.print(JSON.stringify(history));

  return 0;
}

// an edit binds to the version memory-show printed, and replaces the item's whole text
async function runMemoryEdit(flags: CLIFlags, io: CLIIO, args: readonly string[]): Promise<number> {
  const [flag] = args;
  const target = flag === undefined ? null : parseVersionTarget(flag);

  if (target === null || flags.text === undefined) {
    io.print('nixie memory-edit takes <itemID>@<version> and --text <new text>');

    return 2;
  }

  const socketPath = await resolveSocketPath(flags.config);

  const text = flags.text;

  const ref = await sendHostRequest(socketPath, 'memory edit', (client) =>
    client.memory.items.edit({ ...target, text }),
  );

  io.print(JSON.stringify(ref));

  return 0;
}

// a retirement, a restore or a forget binds to the version memory-show printed, so an item that
// changed since refuses it as stale
function makeMemoryVersionChange(command: 'retire' | 'restore' | 'forget'): Command {
  return async (flags, io, args) => {
    const [flag] = args;
    const target = flag === undefined ? null : parseVersionTarget(flag);

    if (target === null) {
      io.print(`nixie memory-${command} takes <itemID>@<version>`);

      return 2;
    }

    const socketPath = await resolveSocketPath(flags.config);

    const ref = await sendHostRequest(socketPath, `memory ${command}`, (client) =>
      client.memory.items[command](target),
    );

    io.print(JSON.stringify(ref));

    return 0;
  };
}

// a pin adds no version, so it names the item alone
function makeMemoryPin(isPinned: boolean): Command {
  return async (flags, io, args) => {
    const [itemID] = args;

    if (itemID === undefined) {
      io.print(`nixie memory-${isPinned ? 'pin' : 'unpin'} takes an item ID`);

      return 2;
    }

    const socketPath = await resolveSocketPath(flags.config);

    const pinned = await sendHostRequest(socketPath, 'memory pin', (client) =>
      client.memory.items.pin({ itemID, isPinned }),
    );

    io.print(JSON.stringify(pinned));

    return 0;
  };
}

// <itemID>@<version>, as memory-show and an approval held for a close match print an item, or null
// when malformed
function parseVersionTarget(flag: string): { itemID: string; version: number } | null {
  const at = flag.lastIndexOf('@');
  const version = flag.slice(at + 1);

  return at < 1 || !/^[1-9]\d*$/u.test(version)
    ? null
    : { itemID: flag.slice(0, at), version: Number(version) };
}
