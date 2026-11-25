import type { TranscriptTurn } from '@heynixie/coding';

export interface TranscriptRow {
  readonly role: string;
  readonly text: string;
  readonly tools?: readonly { readonly name?: string; readonly summary?: string }[] | undefined;
}

// Groups transcript rows, oldest first, into turns: a `user` row and every `assistant` row after it.
// Rows before the first user row make a turn with an empty user text. Keeps the last `count` turns.
export function collectTranscriptTurns(
  rows: readonly TranscriptRow[],
  count: number,
): TranscriptTurn[] {
  const turns: { user: string; assistant: string[]; tools: string[] }[] = [];

  for (const row of rows) {
    if (row.role === 'user') {
      turns.push({ user: row.text, assistant: [], tools: [] });
      continue;
    }

    if (row.role !== 'assistant') {
      continue;
    }

    const turn = turns.at(-1) ?? { user: '', assistant: [], tools: [] };

    if (turns.length === 0) {
      turns.push(turn);
    }

    turn.assistant.push(row.text);

    for (const tool of row.tools ?? []) {
      turn.tools.push([tool.name, tool.summary].filter((part) => part !== undefined).join(': '));
    }
  }

  return turns.slice(-count).map((turn) => ({
    user: turn.user,
    assistant: turn.assistant.join('\n\n'),
    tools: turn.tools,
  }));
}
