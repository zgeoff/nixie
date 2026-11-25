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

test('it queues a ps run and the reply for the shell-processes kind', () => {
  const replies = buildComputerReplies(
    { kind: 'shell-processes', text: 'I listed them.' },
    'http://pages.test:4000/',
  );

  expect(replies).toStrictEqual([
    { toolUse: { name: 'mcp__nixie__computer_run', input: { command: 'ps -e -o args=' } } },
    { text: 'I listed them.' },
  ]);
});

test('it queues the 2 opens and the reply for the browser-two-tabs kind', () => {
  const replies = buildComputerReplies(
    { kind: 'browser-two-tabs', text: 'I opened 2 tabs.' },
    'http://pages.test:4000/',
  );

  expect(replies).toStrictEqual([
    {
      toolUse: {
        name: 'mcp__nixie__computer_browser_open',
        input: { url: 'http://pages.test:4000/' },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__computer_browser_open',
        input: { url: 'http://pages.test:4000/next' },
      },
    },
    { text: 'I opened 2 tabs.' },
  ]);
});
