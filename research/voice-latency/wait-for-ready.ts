// Waits for a call to open, and gives the reason it did not, so a runner records a failed turn and
// goes on to the next one instead of stopping the whole run.
export async function waitForReady(ready: Promise<void>, timeoutMs: number): Promise<string | undefined> {
  return Promise.race([
    ready.then(
      () => undefined,
      (error: unknown) => String(error),
    ),
    Bun.sleep(timeoutMs).then(() => `the call did not open within ${timeoutMs} ms`),
  ]);
}
