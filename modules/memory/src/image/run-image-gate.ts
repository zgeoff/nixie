import { buildGateReview } from '../gate/build-gate-review';
import { buildGatedText } from '../gate/build-gated-text';
import type { ContentGateRequest, ContentGateResult } from '../gate/gate-context';
import { readTokenVerdict } from '../gate/read-token-verdict';
import type { MemoryContext } from '../types';

const invisible = /\p{Cf}/u;

// The gate of a write from a photo that no allow rule covers: always a review, with the token check
// of the text.
export async function runImageGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
): Promise<ContentGateResult> {
  const gatedText = buildGatedText(request);

  if (invisible.test(gatedText)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  const tokens = await readTokenVerdict(context, { text: gatedText, thread: request.thread });

  return buildGateReview('from_photo', { checks: { tokens } });
}
