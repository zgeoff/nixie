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

test('it names the text the page showed when it never makes the expression true', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate("document.body.innerText = 'the kettle is cold'");

  const waited = waitForPage(ctx.view, "document.title === 'kettle boiled'", 200);

  await Promise.allSettled([waited]);

  expect(waited).rejects.toThrow('The page showed: the kettle is cold');
});

test('it gives up after 5 s when the caller passes no timeout', async () => {
  const ctx = await setupTest();

  const waited = waitForPage(ctx.view, "document.title === 'kettle boiled'");

  await Promise.allSettled([waited]);

  expect(waited).rejects.toThrow(
    "the page never made this true within 5000 ms: document.title === 'kettle boiled'",
  );
});

test('it keeps waiting while the expression gives a truthy value other than true', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate("document.title = 'kettle boiled'");

  const waited = waitForPage(ctx.view, 'document.title', 200);

  await Promise.allSettled([waited]);

  expect(waited).rejects.toThrow('document.title');
});

test('it keeps waiting while the page has no body, as between two documents', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(
    "(document.body.remove(), setTimeout(() => { document.documentElement.append(Object.assign(document.createElement('body'), { innerText: 'the kettle boiled' })); }, 200))",
  );

  const waited = waitForPage(ctx.view, "document.body.innerText.includes('the kettle boiled')");

  await Promise.allSettled([waited]);

  expect(waited).resolves.toBeUndefined();
});

test('it names the last error the expression threw when the page never makes it true', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate('document.body.remove()');

  const waited = waitForPage(ctx.view, "document.body.innerText.includes('kettle')", 200);

  await Promise.allSettled([waited]);

  expect(waited).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining('innerText') }),
  });
});
