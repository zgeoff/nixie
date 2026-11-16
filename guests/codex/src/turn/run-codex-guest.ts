import type { GuestFrame, HostFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeFrame,
  encodeTurnFrame,
  hostFrameLimitBytes,
  hostFrameSchema,
  makeFrameDecoder,
} from '@heynixie/wire';
import type { AppServerProcess } from '../app-server/start-app-server';
import { getHome } from './get-home';
import { readCodexVersion } from './read-codex-version';
import { removeSessionState } from './remove-session-state';
import type { CodexTurnDependencies, CodexTurnFrame } from './run-codex-turn';
import { runCodexTurn } from './run-codex-turn';
import { startCodexProcess } from './start-codex-process';

export interface GuestIO {
  readonly input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly env: Readonly<Record<string, string | undefined>>;

  // a test starts a fake app-server in place of the CLI
  readonly startProcess?: (env: Record<string, string>, cwd: string) => AppServerProcess;
  readonly readVersion?: CodexTurnDependencies['readVersion'];
}

export async function runCodexGuest(io: GuestIO): Promise<void> {
  const frames = readHostFrames(io.input)[Symbol.asyncIterator]();
  const emit = (frame: GuestFrame) => io.write(encodeFrame(encodeTurnFrame(frame)));

  try {
    const first = await frames.next();

    if (first.done === true) {
      throw new Error('the host sent no frame');
    }

    await runFirstFrame(first.value, { io, frames, emit });
  } catch (error) {
    await emit({ type: 'failed', reason: 'error', detail: String(error) });
  }
}

async function* readHostFrames(
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<HostFrame> {
  const decode = makeFrameDecoder(hostFrameLimitBytes);

  for await (const chunk of input) {
    for (const message of decode(chunk)) {
      yield decodeTurnFrame(hostFrameSchema, message);
    }
  }
}

interface GuestRun {
  readonly io: GuestIO;
  readonly frames: AsyncIterator<HostFrame>;
  readonly emit: (frame: GuestFrame) => Promise<void>;
}

async function runFirstFrame(frame: HostFrame, run: GuestRun): Promise<void> {
  if (frame.type === 'purge') {
    await removeSessionState(getHome(run.io.env));

    await run.emit({ type: 'purged' });

    return;
  }

  if (frame.type !== 'turn') {
    throw new Error(`the first host frame must start a turn or a purge, not a ${frame.type}`);
  }

  const profile = frame.profile;

  if (profile.harness !== 'codex') {
    throw new Error(
      `the codex guest runs the codex harness, and the profile names ${profile.harness}`,
    );
  }

  const interrupt = new AbortController();

  const turn: CodexTurnFrame = { ...frame, profile };
  const watching = watchForInterrupt(run.frames, interrupt);

  await runCodexTurn(turn, {
    env: run.io.env,
    readVersion: run.io.readVersion ?? readCodexVersion,
    startProcess: run.io.startProcess ?? startCodexProcess,
    interrupt: interrupt.signal,
    emit: run.emit,
  });

  // The host keeps its end open after the turn, so the watch ends with the guest's exit.
  void watching;
}

// An interrupt frame stops the turn. The host sends no other frame during a turn, because the
// harness declares no capability for one.
async function watchForInterrupt(
  frames: AsyncIterator<HostFrame>,
  interrupt: AbortController,
): Promise<void> {
  try {
    for (;;) {
      const next = await frames.next();

      if (next.done === true) {
        return;
      }

      if (next.value.type === 'interrupt') {
        interrupt.abort();
      }
    }
  } catch {
    // a frame that cannot be decoded ends the watch, and the host's own timeout ends the turn
    interrupt.abort();
  }
}
