import type { CallToolResult } from '@modelcontextprotocol/server';
import { buildTypedResult } from '../settle/build-typed-result';
import { toCallToolResult } from '../settle/to-call-tool-result';
import type { DirectResult, RegisteredTool } from '../types';
import type { CallRecorder } from './make-call-recorder';

// A prepare step that ends the call, such as a refusal, records the call with no decision.
export async function writeDirectResult(
  recorder: CallRecorder,
  registered: RegisteredTool,
  result: DirectResult,
): Promise<CallToolResult> {
  const written = await recorder.writeCall(null);

  const settled = buildTypedResult(registered, result, null);

  const recorded = await recorder.writeSettled(written.sequence, settled);

  return toCallToolResult(recorded.settled);
}
