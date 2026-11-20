import { onTestFinished } from 'bun:test';
import { nativeWebSocket } from '@heynixie/testing';
import type { TestImpd, TestImpdOptions } from '@impz/testing';
import { startTestImpd } from '@impz/testing';

// The mock server's preload wraps WebSocket, and the wrapper refuses the close code that impd's
// fault proxy sends upstream. The proxy opens its sockets from the global class, so Bun's own class
// stays in place until the test finishes.
export function startImpd(options: TestImpdOptions = {}): Promise<TestImpd> {
  const wrapped = globalThis.WebSocket;

  Object.assign(globalThis, { WebSocket: nativeWebSocket });

  onTestFinished(() => {
    Object.assign(globalThis, { WebSocket: wrapped });
  });

  return startTestImpd(options);
}
