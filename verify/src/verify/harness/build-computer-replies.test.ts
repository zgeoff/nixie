import { expect, test } from 'bun:test';
import { buildComputerReplies } from './build-computer-replies';

test('it queues the screenshot, the click and the reply for the screen kind', () => {
  const replies = buildComputerReplies(
    { kind: 'screen', text: 'I clicked the middle.' },
    'http://pages.test:4000/',
  );

  expect(replies).toStrictEqual([
    { toolUse: { name: 'mcp__nixie__computer_screenshot', input: {} } },
    {
      toolUse: {
        name: 'mcp__nixie__computer_screen_click',
        input: { x: 640, y: 400, button: 'left' },
      },
    },
    { text: 'I clicked the middle.' },
  ]);
});

test('it queues the navigate, the reload and the reply for the browser-navigate kind', () => {
  const replies = buildComputerReplies(
    { kind: 'browser-navigate', text: 'I went to the next page and reloaded it.' },
    'http://pages.test:4000/',
  );

  expect(replies).toStrictEqual([
    {
      toolUse: {
        name: 'mcp__nixie__computer_browser_navigate',
        input: { tab: 't1', url: 'http://pages.test:4000/next' },
      },
    },
    { toolUse: { name: 'mcp__nixie__computer_browser_reload', input: { tab: 't1' } } },
    { text: 'I went to the next page and reloaded it.' },
  ]);
});
