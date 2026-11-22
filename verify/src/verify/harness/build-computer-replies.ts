import type { ScriptedReply } from '@heynixie/testing';

export interface ComputerSessionInput {
  readonly kind: 'browser' | 'shell';
  readonly text: string;
}

// The replies of a turn in which the model opens the harness's own page in its browser, or writes a
// file on its shell's disk and reads it back.
export function buildComputerReplies(
  input: ComputerSessionInput,
  siteURL: string,
): ScriptedReply[] {
  if (input.kind === 'browser') {
    return [
      { toolUse: { name: 'mcp__nixie__computer_open', input: { url: siteURL } } },
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
