import { WringerError } from '@wringer/core';
import type { StreamClient } from '@wringer/stream';
import type { ConversationRecord } from './collect-conversation-records';
import { collectConversationRecords } from './collect-conversation-records';
import type { ConversationTurn } from './find-conversation-gap';
import { findConversationGap } from './find-conversation-gap';

// The scripted reply can reach the stream a moment after the page shows it, so the read waits this
// long for it.
const settleMs = 10_000;

// Reads the records the harness printed since `use` last marked the stream, until they hold the
// owner's message and then the reply, and fails with `check-failed` when they do not in time.
export async function readConversationTurn(
  client: StreamClient,
  turn: ConversationTurn,
): Promise<{ records: ConversationRecord[] }> {
  const deadline = Date.now() + settleMs;

  for (;;) {
    const lines = await readStreamLines(client);

    const records = collectConversationRecords(lines);
    const gap = findConversationGap(records, turn);

    if (gap === null) {
      return { records };
    }

    if (Date.now() >= deadline) {
      throw new WringerError('check-failed', {
        message: `the conversation records lack ${gap}; they are ${JSON.stringify(records)}`,
      });
    }

    await Bun.sleep(200);
  }
}

async function readStreamLines(client: StreamClient): Promise<string[]> {
  const lines: string[] = [];
  const cursor: { from: number | undefined } = { from: undefined };

  for (;;) {
    const slice = await client.read({
      name: 'app',
      ...(cursor.from === undefined ? {} : { from: cursor.from }),
    });

    lines.push(...slice.records.map((record) => record.line));

    if (!slice.more) {
      return lines;
    }

    cursor.from = slice.cursor;
  }
}
