import type { TestToolRoute } from './with-test-tool-client';
import { withTestToolClient } from './with-test-tool-client';

export interface TestToolCall extends TestToolRoute {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export function sendTestToolCall(call: TestToolCall): Promise<string> {
  return withTestToolClient(call, async (client) => {
    const result = await client.callTool({ name: call.name, arguments: { ...call.input } });

    return JSON.stringify(result);
  });
}
