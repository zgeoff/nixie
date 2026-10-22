import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { checkRequestSchema, decodeTurnFrame } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { ExecStream, StreamExit } from '../types';

type OutputController = ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

export function startStubCheck(answer: (request: CheckRequest) => CheckReply): ExecStream {
  const opened: { controller?: OutputController } = {};

  const messages = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start: (controller) => {
      opened.controller = controller;
    },
  });

  const controller = opened.controller;

  invariant(controller, 'a readable stream starts in its constructor');

  const exit = Promise.withResolvers<StreamExit>();
  const state = { hasEnded: false };

  const end = (ended: StreamExit) => {
    if (!state.hasEnded) {
      state.hasEnded = true;

      controller.close();
      exit.resolve(ended);
    }
  };

  return {
    messages,
    send: (bytes) => {
      const reply = answer(decodeTurnFrame(checkRequestSchema, bytes));

      controller.enqueue(new TextEncoder().encode(JSON.stringify(reply)));

      end({ code: 0, signal: null, stderr: noStderr });

      return Promise.resolve();
    },
    exit: exit.promise,
    stop: () => {
      end({ code: null, signal: 'SIGTERM', stderr: noStderr });

      return exit.promise;
    },
  };
}
