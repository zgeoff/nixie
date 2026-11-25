import type { VoiceLines } from '../types';

export interface AnswerParts {
  // the text of each reply record that the turn wrote, in order
  readonly replies: readonly string[];

  // true when the turn failed, ended on a proposal or passed a limit
  readonly isFailed: boolean;
  readonly lines: Pick<VoiceLines, 'couldntFinish'>;
}

// The whole text that the speech layer gets for a hand-off. A turn that failed or wrote no text gets
// the fixed line instead, because an empty answer makes the speech layer invent one, and the line
// claims no outcome.
export function pickAnswerText(parts: AnswerParts): string {
  const text = parts.replies
    .map((reply) => reply.trim())
    .filter((reply) => reply !== '')
    .join('\n\n');

  return parts.isFailed || text === '' ? parts.lines.couldntFinish : text;
}
