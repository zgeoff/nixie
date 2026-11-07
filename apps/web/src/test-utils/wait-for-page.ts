import { waitForCondition } from '@heynixie/testing';

// A journey waits on a turn that starts the Agent SDK cold, which takes seconds on a CI runner.
const defaultTimeoutMs = 10_000;

export async function waitForPage(
  view: Bun.WebView,
  expression: string,
  timeoutMs: number = defaultTimeoutMs,
): Promise<void> {
  await waitForCondition(async () => (await view.evaluate(expression)) === true, {
    intervalMs: 50,
    timeoutMs,
  }).catch((error: unknown) => {
    throw new Error(`the page never made this true within ${timeoutMs} ms: ${expression}`, {
      cause: error,
    });
  });
}
