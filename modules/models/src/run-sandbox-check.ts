import type { Sandbox } from '@heynixie/sandbox';
import type { CheckRequest } from '@heynixie/wire';
import { checkReplySchema, decodeTurnFrame, turnFrameLimitBytes } from '@heynixie/wire';
import type { GuestCommand } from './run-guest-turn';

export interface SandboxCheck {
  readonly sandbox: Pick<Sandbox, 'spawn'>;
  readonly command: GuestCommand;
  readonly request: CheckRequest;

  // aborts when the checker's timeout fires, which stops the guest
  readonly signal: AbortSignal;
}

// Runs one check in the checker's sandbox: it starts the check guest, sends the request frame and
// reads the one reply frame. It returns the query's structured output, and throws when the guest
// failed or exited with no reply.
export async function runSandboxCheck(check: SandboxCheck): Promise<unknown> {
  const stream = await check.sandbox.spawn({
    argv: check.command.argv,
    env: check.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });
  const stopGuest = () => {
    void stream.stop();
  };

  check.signal.addEventListener('abort', stopGuest, { once: true });
  try {
    await stream.send(new TextEncoder().encode(JSON.stringify(check.request)));
    return await readCheckOutput(stream.messages);
  } finally {
    check.signal.removeEventListener('abort', stopGuest);
    await stream.stop();
  }
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream has no readonly form
async function readCheckOutput(messages: AsyncIterable<Uint8Array>): Promise<unknown> {
  for await (const message of messages) {
    const reply = decodeTurnFrame(checkReplySchema, message);

    if (reply.kind === 'failed') {
      throw new Error(`the check guest failed: ${reply.reason}`);
    }
    return reply.output;
  }
  throw new Error('the check guest exited with no reply');
}
