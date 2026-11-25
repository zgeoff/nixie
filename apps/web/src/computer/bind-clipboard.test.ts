import { expect, test } from 'bun:test';
import { bindClipboard } from './bind-clipboard';

function setupTest() {
  const target = document.createElement('div');
  const canvas = document.createElement('canvas');

  target.append(canvas);

  const pasted: string[] = [];
  const seenKeys: string[] = [];

  canvas.addEventListener('keydown', (event) => {
    seenKeys.push(event.key);
  });

  const unbind = bindClipboard(target, {
    onPaste: (text) => {
      pasted.push(text);
    },
  });

  const paste = (text: string): Event => {
    const event = new Event('paste', { bubbles: true, cancelable: true });

    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    canvas.dispatchEvent(event);

    return event;
  };

  return { canvas, pasted, seenKeys, unbind, paste };
}

test('it passes pasted text on and keeps the page from inserting it', () => {
  const ctx = setupTest();
  const event = ctx.paste('hunter2');

  expect([ctx.pasted, event.defaultPrevented]).toStrictEqual([['hunter2'], true]);
});

test('it passes nothing on for a paste of no text', () => {
  const ctx = setupTest();

  ctx.paste('');

  expect(ctx.pasted).toStrictEqual([]);
});

test.each([
  { name: 'ctrl+v', init: { key: 'v', ctrlKey: true } },
  { name: 'cmd+v', init: { key: 'V', metaKey: true } },
])('it keeps $name from reaching the viewer, whose paste follows from the paste event', (row) => {
  const ctx = setupTest();

  ctx.canvas.dispatchEvent(new KeyboardEvent('keydown', { ...row.init, bubbles: true }));

  expect(ctx.seenKeys).toStrictEqual([]);
});

test('it lets any other key reach the viewer', () => {
  const ctx = setupTest();

  ctx.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));

  ctx.canvas.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }),
  );

  expect(ctx.seenKeys).toStrictEqual(['v', 'c']);
});

test('it stops listening once unbound', () => {
  const ctx = setupTest();

  ctx.unbind();
  ctx.paste('hunter2');

  ctx.canvas.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }),
  );

  expect([ctx.pasted, ctx.seenKeys]).toStrictEqual([[], ['v']]);
});
