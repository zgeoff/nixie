import type { CallToolResult } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';

const fencedPattern =
  /^<tool-result source="untrusted" fence="(?<fence>[0-9a-f]+)">\n(?<body>[\s\S]*)\n<\/tool-result fence="\k<fence>">$/u;

// The JSON body of a tool result that reached the model as one fenced text block.
export function parseFencedResult(result: CallToolResult): unknown {
  const block = result.content.find((candidate) => candidate.type === 'text');

  invariant(block?.type === 'text', 'the result holds a text block');

  const body = fencedPattern.exec(block.text)?.groups?.['body'];

  invariant(body !== undefined, 'the text block is fenced as untrusted');

  const parsed: unknown = JSON.parse(body);

  return parsed;
}
