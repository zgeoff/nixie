import { expect, test } from 'bun:test';
import { buildComputerReplies } from './build-computer-replies';

test('it queues the page open, the screenshot, the click and the reply for the screen kind', () => {
  const replies = buildComputerReplies(
    { kind: 'screen', text: 'I clicked the middle.' },
    'http://pages.test:4000/',
  );

  expect(replies).toStrictEqual([
    {
      toolUse: {
        name: 'mcp__nixie__computer_browser_open',
        input: { url: 'http://pages.test:4000/' },
      },
    },
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
