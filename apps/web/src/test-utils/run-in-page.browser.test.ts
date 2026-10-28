import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { checkBrowserSkip } from './check-browser-skip';
import { createBrowserView } from './create-browser-view';
import { runInPage } from './run-in-page';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  return { view };
}

test.skipIf(browserSkip.isSkipped)(
  'it runs the function in the page with its argument and returns the result the schema parses',
  async () => {
    const ctx = await setupTest();

    const result = await runInPage(
      ctx.view,
      (terms: readonly [number, number]) => ({ sum: terms[0] + terms[1], url: location.href }),
      [2, 3],
      z.object({ sum: z.number(), url: z.string() }),
    );

    expect(result).toStrictEqual({ sum: 5, url: 'about:blank' });
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it refuses a result that loses its fields on the way out of the page',
  async () => {
    const ctx = await setupTest();

    const result = runInPage(
      ctx.view,
      () => new Blob(['note']),
      null,
      z.object({ size: z.number() }),
    );

    await Promise.allSettled([result]);

    expect(result).rejects.toMatchObject({ name: 'ZodError', issues: [{ path: ['size'] }] });
  },
);
