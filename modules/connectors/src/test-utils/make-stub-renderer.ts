import type { RenderReply, RenderRequest } from '@heynixie/wire';
import {
  decodeRenderRequest,
  encodeFrame,
  encodeRenderMessage,
  makeFrameDecoder,
  renderFrameLimitBytes,
} from '@heynixie/wire';
import type { StubGuest } from './build-stub-sandbox-adapter';

// A render guest that answers its one request with the reply the test picks, and hands the request
// it read to the test.
export function makeStubRenderer(
  answer: (request: RenderRequest) => RenderReply,
  received: RenderRequest[] = [],
): StubGuest {
  return async (stdin, stdout) => {
    const decode = makeFrameDecoder(renderFrameLimitBytes);
    const reader = stdin.getReader();

    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) {
        return 1;
      }

      const [frame] = decode(chunk.value);

      if (frame !== undefined) {
        const request = decodeRenderRequest(frame);

        received.push(request);

        const reply = encodeRenderMessage(answer(request));

        await stdout.write(encodeFrame(reply));

        return 0;
      }
    }
  };
}
