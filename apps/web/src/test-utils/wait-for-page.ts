import { waitForCondition } from '@heynixie/testing';

// A journey's slowest turn takes about 4.5 s on a CI runner, and the browser lane gives the whole
// test 10 s, so a wait gives up first and names what the page never showed.
const defaultTimeoutMs = 5000;

export async function waitForPage(
  view: Bun.WebView,
  expression: string,
  timeoutMs: number = defaultTimeoutMs,
): Promise<void> {
  const [waited] = await Promise.allSettled([
    waitForCondition(async () => (await view.evaluate(expression)) === true, {
      intervalMs: 50,
      timeoutMs,
    }),
  ]);

  if (waited.status === 'fulfilled') {
    return;
  }

  const [shown] = await Promise.allSettled([view.evaluate('document.body.innerText')]);

  const text = shown.status === 'fulfilled' ? String(shown.value) : 'a text that did not read';

  throw new Error(
    `the page never made this true within ${timeoutMs} ms: ${expression}\nThe page showed: ${text.slice(0, 400)}`,
    { cause: waited.reason },
  );
}
