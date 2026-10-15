// oxlint-disable typescript/prefer-readonly-parameter-types -- an async iterable has no readonly form
import type { CheckReply, CheckRequest } from '@heynixie/wire';
import {
  checkRequestSchema,
  decodeTurnFrame,
  encodeFrame,
  makeFrameDecoder,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import type { CheckDependencies } from './run-check-query';
import { runCheckQuery } from './run-check-query';

export interface CheckIO extends CheckDependencies {
  readonly input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
}

// Runs the check guest for one check: it reads the request frame, runs the query, and writes one
// reply frame. A failure becomes a failed reply, so the host always learns how the check ended.
export async function runCheckGuest(io: CheckIO): Promise<void> {
  const reply = await readReply(io);

  const bytes = new TextEncoder().encode(JSON.stringify(reply));

  await io.write(encodeFrame(bytes));
}

async function readReply(io: CheckIO): Promise<CheckReply> {
  try {
    const request = await readRequest(io.input);

    return await runCheckQuery(request, io);
  } catch (error) {
    return { kind: 'failed', reason: String(error) };
  }
}

async function readRequest(input: CheckIO['input']): Promise<CheckRequest> {
  const decode = makeFrameDecoder(turnFrameLimitBytes);

  for await (const chunk of input) {
    const [message] = decode(chunk);

    if (message !== undefined) {
      return decodeTurnFrame(checkRequestSchema, message);
    }
  }

  throw new Error('the host sent no check request');
}
