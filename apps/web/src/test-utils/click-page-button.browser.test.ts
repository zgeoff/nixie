import { expect, onTestFinished, test } from 'bun:test';
import { clickPageButton } from './click-page-button';

async function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  return { view };
}

test('it clicks the button whose text is the label', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(
    `document.body.innerHTML = '<button onclick="document.title = 1">Keep it</button><button onclick="document.title = 2">Forget</button>'`,
  );

  await clickPageButton(ctx.view, 'Forget');

  const title: unknown = await ctx.view.evaluate('document.title');

  expect(title).toBe('2');
});

test('it waits for a disabled button to be enabled before it clicks', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(
    `document.body.innerHTML = '<button disabled onclick="document.title = 1">Forget</button>'`,
  );

  await ctx.view.evaluate(
    "setTimeout(() => { document.querySelector('button').disabled = false; }, 200)",
  );

  await clickPageButton(ctx.view, 'Forget');

  const title: unknown = await ctx.view.evaluate('document.title');

  expect(title).toBe('1');
});

test('it rejects when the page has no enabled button with the label', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(`document.body.innerHTML = '<button disabled>Forget</button>'`);

  const clicked = clickPageButton(ctx.view, 'Forget');

  await Promise.allSettled([clicked]);

  expect(clicked).rejects.toThrow('data-click-target');
});
