import type { CallToolResult } from '@modelcontextprotocol/server';
import { buildMessage } from '../settle/build-message';
import { toCallToolResult } from '../settle/to-call-tool-result';
import type { CallRecorder } from './make-call-recorder';

// A refusal is nixie's own sentence, so it reaches the model as plain error text.
export async function writeRefusedCall(
  recorder: CallRecorder,
  refusal: string,
): Promise<CallToolResult> {
  const written = await recorder.writeCall(null);

  const refused = await recorder.writeSettled(
    written.sequence,
    buildMessage('error', refusal, { source: 'owner_data' }),
  );

  return toCallToolResult(refused.settled);
}
