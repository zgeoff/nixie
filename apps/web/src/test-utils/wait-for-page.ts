import { waitForCondition } from '@heynixie/testing';

// A journey's slowest turn takes about 4.5 s on a CI runner, and the browser lane gives the whole
// test 10 s, so a wait gives up first and names what the page never showed.
const defaultTimeoutMs = 5000;

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
