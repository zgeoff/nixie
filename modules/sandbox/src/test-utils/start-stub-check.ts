import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { checkRequestSchema, decodeTurnFrame } from '@heynixie/wire';
import type { ExecStream, StreamExit } from '../types';

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

export function startStubCheck(answer: (request: CheckRequest) => CheckReply): ExecStream {
  const output = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

  const writer = output.writable.getWriter();
  const exit = Promise.withResolvers<StreamExit>();

  const stopCheck = async (ended: StreamExit) => {
    await writer.close().catch(() => {});

    exit.resolve(ended);
  };

  return {
    messages: output.readable,
    send: (bytes) => {
      const reply = answer(decodeTurnFrame(checkRequestSchema, bytes));

      // The write settles only once the host reads the reply, which it does after this send returns.
      void (async () => {
        await writer.write(new TextEncoder().encode(JSON.stringify(reply))).catch(() => {});

        await stopCheck({ code: 0, signal: null, stderr: noStderr });
      })();

      return Promise.resolve();
    },
    exit: exit.promise,
    stop: async () => {
      await stopCheck({ code: null, signal: 'SIGTERM', stderr: noStderr });

      return exit.promise;
    },
  };
}
