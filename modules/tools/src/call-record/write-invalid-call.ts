import type { CallToolResult } from '@modelcontextprotocol/server';
import { buildMessage } from '../settle/build-message';
import { toCallToolResult } from '../settle/to-call-tool-result';
import type { CallRecorder } from './make-call-recorder';

export async function writeInvalidCall(
  recorder: CallRecorder,
  errors: string,
): Promise<CallToolResult> {
  const written = await recorder.writeCall(null);

  // the errors repeat the input's own keys, which the model chose
  const invalid = await recorder.writeSettled(
    written.sequence,
    buildMessage('invalid', errors, { source: 'untrusted' }),
  );

  return toCallToolResult(invalid.settled);
}
