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
  const timings: CheckTimings = { startedAt, spawnMs: null, reply: null };

  try {
    return await runGuestCheck(check, timings);
  } finally {
    check.log('checker.timed', {
      outcome: timings.reply?.kind ?? (check.signal.aborted ? 'aborted' : 'no_reply'),
      spawnMs: timings.spawnMs,
      replyMs: timings.reply === null ? null : timings.reply.atMs,
      cliMs: timings.reply?.kind === 'answer' ? Math.round(timings.reply.durationMs) : null,
      apiMs: timings.reply?.kind === 'answer' ? Math.round(timings.reply.apiMs) : null,
      totalMs: Math.round(performance.now() - startedAt),
    });
  }
}

// the times a check reached, in ms from its start; a phase it never reached stays null
interface CheckTimings {
  readonly startedAt: number;
  spawnMs: number | null;
  reply: (CheckReply & { readonly atMs: number }) | null;
}

async function runGuestCheck(check: SandboxCheck, timings: CheckTimings): Promise<unknown> {
  const stream = await check.sandbox.spawn({
    argv: check.command.argv,
    env: check.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });

  timings.spawnMs = Math.round(performance.now() - timings.startedAt);

  const reply = await readGuestReply(check, stream, timings);

  return toCheckOutput(reply);
}

async function readGuestReply(
  check: SandboxCheck,
  stream: ExecStream,
  timings: CheckTimings,
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

    timings.reply = { ...reply, atMs: Math.round(performance.now() - timings.startedAt) };
    return reply;
  } finally {
    check.signal.removeEventListener('abort', stopGuest);
    await stream.stop();
  }
}

function toCheckOutput(reply: CheckReply): unknown {
  if (reply.kind === 'failed') {
    throw new Error(`the check guest failed: ${reply.reason}`);
  }
  return reply.output;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream has no readonly form
async function readCheckReply(messages: AsyncIterable<Uint8Array>): Promise<CheckReply> {
  for await (const message of messages) {
    return decodeTurnFrame(checkReplySchema, message);
  }
  throw new Error('the check guest exited with no reply');
}
