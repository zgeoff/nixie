import type { DrawReply, DrawRequest, ImageProvider } from '../types';
import { encodeTestImage } from './encode-test-image';

export type StubImageReply = (request: DrawRequest) => Promise<DrawReply> | DrawReply;

export interface StubImageProvider extends ImageProvider {
  // what the provider takes, which a test can narrow
  readonly takes: { source: boolean; references: boolean };

  // every request the provider got, oldest first
  readonly requests: readonly DrawRequest[];

  // answers each later request as the function says, in place of a 100 by 50 PNG
  readonly replyWith: (reply: StubImageReply) => void;
}

// A provider that draws a 100 by 50 PNG until a test gives it another reply.
export function buildStubImageProvider(): StubImageProvider {
  const requests: DrawRequest[] = [];
  let reply: StubImageReply | null = null;

  return {
    takes: { source: true, references: true },
    requests,
    replyWith: (next) => {
      reply = next;
    },
    draw: async (request) => {
      requests.push(request);

      if (reply !== null) {
        return reply(request);
      }

      return {
        kind: 'image',
        mediaType: 'image/png',
        bytes: await encodeTestImage({ width: 100, height: 50 }, 'png'),
      };
    },
  };
}
