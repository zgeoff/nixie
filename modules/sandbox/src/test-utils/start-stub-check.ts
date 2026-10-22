import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { checkRequestSchema, decodeTurnFrame } from '@heynixie/wire';
import type { ExecStream, StreamExit } from '../types';

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

export function startStubCheck(answer: (request: CheckRequest) => CheckReply): ExecStream {
  const reply = Promise.withResolvers<Uint8Array<ArrayBuffer> | null>();
  const exit = Promise.withResolvers<StreamExit>();
  const state = { hasEnded: false, isStopped: false };

  const end = (ended: StreamExit, bytes: Uint8Array<ArrayBuffer> | null) => {
    if (!state.hasEnded) {
      state.hasEnded = true;

      reply.resolve(bytes);
      exit.resolve(ended);
    }
  };

  const messages = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull: async (controller) => {
        const bytes = await reply.promise;

        if (bytes !== null && !state.isStopped) {
          controller.enqueue(bytes);
        }

        controller.close();
      },
    },
    { highWaterMark: 0 },
  );

  return {
    messages,
    send: (bytes) => {
      const answered = answer(decodeTurnFrame(checkRequestSchema, bytes));

      end(
        { code: 0, signal: null, stderr: noStderr },
        new TextEncoder().encode(JSON.stringify(answered)),
      );

      return Promise.resolve();
    },
    exit: exit.promise,
    stop: () => {
      state.isStopped = true;

      end({ code: null, signal: 'SIGTERM', stderr: noStderr }, null);

      return exit.promise;
    },
  };
}
