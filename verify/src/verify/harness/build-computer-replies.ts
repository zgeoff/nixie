import type { ScriptedReply } from '@heynixie/testing';
import { match } from 'ts-pattern';

export interface ComputerSessionInput {
  readonly kind: 'browser' | 'browser-navigate' | 'shell' | 'shell-processes' | 'screen';
  readonly text: string;
}

// A journey needs a fixed turn for each kind, because the CLI cannot make the model choose.
export function buildComputerReplies(
  input: ComputerSessionInput,
  siteURL: string,
): ScriptedReply[] {
  return match(input.kind)
    .with('browser', (): ScriptedReply[] => [
      { toolUse: { name: 'mcp__nixie__computer_browser_open', input: { url: siteURL } } },
      { text: input.text },
    ])
    .with('browser-navigate', (): ScriptedReply[] => [
      {
        toolUse: {
          name: 'mcp__nixie__computer_browser_navigate',
          input: { tab: 't1', url: `${siteURL}next` },
        },
      },
      { toolUse: { name: 'mcp__nixie__computer_browser_reload', input: { tab: 't1' } } },
      { text: input.text },
    ])
    .with('shell-processes', (): ScriptedReply[] => [
      { toolUse: { name: 'mcp__nixie__computer_run', input: { command: 'ps -e -o args=' } } },
      { text: input.text },
    ])
    .with('screen', (): ScriptedReply[] => [
      { toolUse: { name: 'mcp__nixie__computer_screenshot', input: {} } },
      {
        toolUse: {
          name: 'mcp__nixie__computer_screen_click',
          input: { x: 640, y: 400, button: 'left' },
        },
      },
      { text: input.text },
    ])
    .with('shell', (): ScriptedReply[] => [
      {
        toolUse: {
          name: 'mcp__nixie__computer_write_file',
          input: { path: 'notes/hello.txt', text: 'hello from the shell' },
        },
      },
      { toolUse: { name: 'mcp__nixie__computer_read_file', input: { path: 'notes/hello.txt' } } },
      { text: input.text },
    ])
    .exhaustive();
}
