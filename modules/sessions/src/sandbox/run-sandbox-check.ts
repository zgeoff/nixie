import type { Logger } from '@heynixie/logger';
import type { ExecStream, GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { checkReplySchema, decodeTurnFrame, turnFrameLimitBytes } from '@heynixie/wire';

export interface SandboxCheck {
  readonly sandbox: Pick<Sandbox, 'spawn'>;
  readonly command: GuestCommand;
  readonly request: CheckRequest;

  readonly signal: AbortSignal;

  readonly log: Logger;
}

export async function runSandboxCheck(check: SandboxCheck): Promise<unknown> {
  const startedAt = performance.now();
  const readElapsedMs = () => Math.round(performance.now() - startedAt);
  let spawnMs: number | null = null;
  let reply: CheckReply | null = null;
  let replyMs: number | null = null;

  try {
    return await runGuestCheck(check, {
      spawned: () => {
        spawnMs = readElapsedMs();
      },
      replied: (received) => {
        reply = received;
        replyMs = readElapsedMs();
      },
    });
  } finally {
    check.log('checker.timed', {
      ...buildReplyTimings(reply, check.signal.aborted),
      spawnMs,
      replyMs,
      totalMs: readElapsedMs(),
    });
  }
}

interface CheckMarks {
  readonly spawned: () => void;
  readonly replied: (reply: CheckReply) => void;
}

async function runGuestCheck(check: SandboxCheck, marks: CheckMarks): Promise<unknown> {
  const stream = await check.sandbox.spawn({
    argv: check.command.argv,
    env: check.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });

  marks.spawned();

  const reply = await readGuestReply(check, stream, marks);

  return toCheckOutput(reply);
}

async function readGuestReply(
  check: SandboxCheck,

  stream: ExecStream,
  marks: CheckMarks,
): Promise<CheckReply> {
  const stopGuest = () => {
    void stream.stop();
  };

  check.signal.addEventListener('abort', stopGuest, { once: true });

  try {
    // An AbortSignal fires no abort listener added after it aborted.
    check.signal.throwIfAborted();

    await stream.send(new TextEncoder().encode(JSON.stringify(check.request)));

    const reply = await readCheckReply(stream.messages);

    marks.replied(reply);

    return reply;
  } finally {
    check.signal.removeEventListener('abort', stopGuest);

    await stream.stop();
  }
}

async function readCheckReply(messages: AsyncIterable<Uint8Array>): Promise<CheckReply> {
  for await (const message of messages) {
    return decodeTurnFrame(checkReplySchema, message);
  }

  throw new Error('the check guest exited with no reply');
}

function toCheckOutput(reply: CheckReply): unknown {
  if (reply.kind === 'failed') {
    throw new Error(`the check guest failed: ${reply.reason}`);
  }

  return reply.output;
}

function buildReplyTimings(reply: CheckReply | null, isAborted: boolean) {
  if (reply === null) {
    return { outcome: isAborted ? 'aborted' : 'error', cliMs: null, apiMs: null };
  }

  if (reply.kind === 'failed') {
    return { outcome: 'failed', cliMs: null, apiMs: null };
  }

  return {
    outcome: 'answer',
    cliMs: Math.round(reply.durationMs),
    apiMs: Math.round(reply.apiMs),
  };
}
