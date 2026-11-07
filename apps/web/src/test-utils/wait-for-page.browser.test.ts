import { expect, onTestFinished, test } from 'bun:test';
import { waitForPage } from './wait-for-page';

async function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  return { view };
}

test('it resolves once the expression turns true in the page', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate("setTimeout(() => { document.title = 'kettle boiled'; }, 200)");

  const waited = waitForPage(ctx.view, "document.title === 'kettle boiled'");

  await Promise.allSettled([waited]);

  expect(waited).resolves.toBeUndefined();
});

test('it rejects with the expression when the page never makes it true', async () => {
  const ctx = await setupTest();

  const waited = waitForPage(ctx.view, "document.title === 'kettle boiled'", 200);

  await Promise.allSettled([waited]);

  expect(waited).rejects.toThrow("document.title === 'kettle boiled'");
});

test('it keeps waiting while the expression gives a truthy value other than true', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate("document.title = 'kettle boiled'");

  const waited = waitForPage(ctx.view, 'document.title', 200);

  await Promise.allSettled([waited]);

  expect(waited).rejects.toThrow('document.title');
});
