import type { Logger } from '@heynixie/ops';
import type { ExecStream, Sandbox } from '@heynixie/sandbox';
import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { checkReplySchema, decodeTurnFrame, turnFrameLimitBytes } from '@heynixie/wire';
import type { GuestCommand } from './run-guest-turn';

export interface SandboxCheck {
  readonly sandbox: Pick<Sandbox, 'spawn'>;
  readonly command: GuestCommand;
  readonly request: CheckRequest;

  // aborts when the checker's timeout fires, which stops the guest
  readonly signal: AbortSignal;

  // takes one checker.timed line per check, a timed-out one included
  readonly log: Logger;
}

// Runs one check in the checker's sandbox, and logs whether the sandbox, the guest or the model API
// took its time. It returns the query's structured output, and throws when the guest failed or
// exited with no reply.
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

// marks each phase of a check as it ends
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

// marks the reply as soon as it is read, so the guest's stop counts toward the total and never
// toward the reply time
async function readGuestReply(
  check: SandboxCheck,

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream has no readonly form
  stream: ExecStream,
  marks: CheckMarks,
): Promise<CheckReply> {
  const stopGuest = () => {
    void stream.stop();
  };

  check.signal.addEventListener('abort', stopGuest, { once: true });

  try {
    // a timeout that fired while the guest started finds no listener, so the guest stops here
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

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream has no readonly form
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

// the reply's outcome and the guest's own CLI and API times; a check with no reply has neither
// time, and one that threw before a reply, as a failed spawn or an unreadable frame, is an error
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
