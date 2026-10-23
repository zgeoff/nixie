import type { TestToolRoute } from './with-test-tool-client';
import { withTestToolClient } from './with-test-tool-client';

export function readTestToolNames(route: TestToolRoute): Promise<readonly string[]> {
  return withTestToolClient(route, async (client) => {
    const listed = await client.listTools();

    return listed.tools.map((tool) => tool.name);
  });
}
