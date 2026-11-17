import { parseJSONObject } from '@heynixie/log';
import { buildMockToolCall } from '@heynixie/tools/test-utils';

export function buildReminderToolCall(tool: string, input: object) {
  const json = parseJSONObject(JSON.stringify(input));

  return buildMockToolCall({ tool, input: json });
}
