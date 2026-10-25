// @boundaries-ignore the spike reads the export the retrieval spike reads
import type { PlainRecord } from '../../memory-retrieval/real-turns/read-plain-export.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { readErasableText } from '../../memory-retrieval/real-turns/read-plain-export.ts';
import type { ConsentCase, Exchange, LabelTurn } from './types.ts';

// The owner's messages and the assistant's replies that a labeller reads before a turn: about the 2
// exchanges before it.
const earlierEntries = 4;

// Gathers the natural pairs of each turn into one labeller call. Swapped pairs need no label,
// because their call came from another turn.
export function buildLabelTurns(records: readonly PlainRecord[], cases: readonly ConsentCase[]): LabelTurn[] {
  const entries = records.flatMap((record) => {
    if (record.thread !== 'conversation') {
      return [];
    }

    const role = pickRole(record.kind);
    const text = role === null ? null : readErasableText(record);

    return role === null || text === null ? [] : [{ sequence: record.sequence, role, text }];
  });
  const turns = new Map<number, LabelTurn>();

  for (const consentCase of cases) {
    if (consentCase.bucket !== 'natural') {
      continue;
    }

    const call = { caseID: consentCase.caseID, tool: consentCase.call.tool, input: consentCase.call.input };
    const turn = turns.get(consentCase.stepSequence);

    if (turn !== undefined) {
      turn.calls.push(call);

      continue;
    }

    const first = Math.min(...consentCase.messages.map((message) => message.sequence));

    turns.set(consentCase.stepSequence, {
      stepSequence: consentCase.stepSequence,
      earlier: entries
        .filter((entry) => entry.sequence < first)
        .slice(-earlierEntries)
        .map(({ role, text }): Exchange => ({ role, text })),
      messages: consentCase.messages,
      calls: [call],
    });
  }

  return [...turns.values()];
}

function pickRole(kind: string): Exchange['role'] | null {
  if (kind === 'owner_message') {
    return 'owner';
  }

  return kind === 'model.reply' ? 'assistant' : null;
}
