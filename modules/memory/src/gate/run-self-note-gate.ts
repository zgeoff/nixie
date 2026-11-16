import type { MemoryContext } from '../types';
import { buildGateReview } from './build-gate-review';
import { buildGatedText } from './build-gated-text';
import type { ContentGateRequest, ContentGateResult } from './gate-context';
import { readTokenVerdict } from './read-token-verdict';

const invisible = /\p{Cf}/u;

export async function runSelfNoteGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: Pick<ContentGateRequest, 'text' | 'labelTexts' | 'thread'>,
): Promise<ContentGateResult> {
  const gatedText = buildGatedText(request);

  if (invisible.test(gatedText)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  const tokens = await readTokenVerdict(context, { text: gatedText, thread: request.thread });

  return buildGateReview('self_note', { checks: { tokens } });
}
