import type { ScriptedReply } from '@heynixie/testing';

export interface ComputerSessionInput {
  readonly kind: 'browser' | 'browser-navigate' | 'shell' | 'screen';
  readonly text: string;
}

// The replies of a turn in which the model opens the harness's own page in its browser, sends the
// tab to the harness's next page and reloads it, writes a file on its shell's disk and reads it back,
// or takes a screenshot of the desktop and clicks a point of it.
export function buildComputerReplies(
  input: ComputerSessionInput,
  siteURL: string,
): ScriptedReply[] {
  if (input.kind === 'browser') {
    return [
      { toolUse: { name: 'mcp__nixie__computer_browser_open', input: { url: siteURL } } },
      { text: input.text },
    ];
  }

  if (input.kind === 'browser-navigate') {
    return [
      {
        toolUse: {
          name: 'mcp__nixie__computer_browser_navigate',
          input: { tab: 't1', url: `${siteURL}next` },
        },
      },
      { toolUse: { name: 'mcp__nixie__computer_browser_reload', input: { tab: 't1' } } },
      { text: input.text },
    ];
  }

  if (input.kind === 'screen') {
    return [
      { toolUse: { name: 'mcp__nixie__computer_screenshot', input: {} } },
      {
        toolUse: {
          name: 'mcp__nixie__computer_screen_click',
          input: { x: 640, y: 400, button: 'left' },
        },
      },
      { text: input.text },
    ];
  }

  return [
    {
      toolUse: {
        name: 'mcp__nixie__computer_write_file',
        input: { path: 'notes/hello.txt', text: 'hello from the shell' },
      },
    },
    { toolUse: { name: 'mcp__nixie__computer_read_file', input: { path: 'notes/hello.txt' } } },
    { text: input.text },
  ];
}
