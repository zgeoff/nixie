import type { GuestFrame, HostFrame } from '@heynixie/wire';
import { readStubGuestHistory } from './read-stub-guest-history';
import type { StubGuestRun } from './run-stub-guest-turn';

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

// Runs one summary as the conversation guest does: a fork at the resume point with the instruction
// added, and a summary built from the session's own transcript, at the fork's last chain entry. It
// removes no session.
export function runStubGuestSummary(
  frame: SummarizeFrame,
  run: Pick<StubGuestRun, 'disk' | 'home' | 'countTokens'>,
): readonly GuestFrame[] {
  const read = readStubGuestHistory(run, frame.resume);

  if ('failure' in read) {
    return [read.failure];
  }

  const history = read.history;
  const text = buildSummaryText(history);

  const instruction = {
    uuid: crypto.randomUUID(),
    role: 'user',
    text: frame.instruction,
    tokens: run.countTokens(frame.instruction),
  } as const;

  const summary = {
    uuid: crypto.randomUUID(),
    role: 'assistant',
    text,
    tokens: run.countTokens(text),
  } as const;

  const sessionID = crypto.randomUUID();

  run.disk.writeSession(run.home, sessionID, [...history, instruction, summary]);

  return [
    {
      type: 'summarized',
      boundary: { sessionID, messageID: summary.uuid },
      text,
      usage: {
        inputTokens: instruction.tokens,
        outputTokens: summary.tokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
  ];
}

// the entry count and the last reply, so a test sees which transcript the summary came from
function buildSummaryText(history: readonly { role: string; text: string }[]): string {
  const lastReply = history.findLast((entry) => entry.role === 'assistant' && entry.text !== '');

  return `Summary of the session: ${history.length} entries, the last reply was "${lastReply?.text ?? ''}".`;
}
