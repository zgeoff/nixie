import { expect, onTestFinished, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { waitForCondition } from '../../libs/testing/src/index';
import type { ReceivedEvent } from './test-utils/collect-step-events';
import { collectStepEvents } from './test-utils/collect-step-events';
import { createLiveSession } from './test-utils/create-live-session';
import { isStepInFlight } from './test-utils/is-step-in-flight';
import { parseLiveEnv } from './test-utils/parse-live-env';
import { requireLiveValue } from './test-utils/require-live-value';

// A live check of the live stream through the deployment's ingress, which
// docs/runbooks/live-checks.md runs. It skips unless the URL and the kubeconfig are set.
const live = parseLiveEnv(process.env);

// Enrols a device and revokes its session when the test ends, then waits until no step of the
// conversation is in flight, so the first step that starts after the check's message takes it.
async function setupTest() {
  const session = await createLiveSession(
    requireLiveValue(live.url, 'NIXIE_LIVE_URL'),
    requireLiveValue(live.kubectl, 'NIXIE_LIVE_KUBECONFIG'),
  );

  onTestFinished(() => session.revoke());
  await waitForCondition(
    async () => {
      const page = await session.client.conversation.read({ thread: 'conversation', limit: 200 });

      return !isStepInFlight(page.records);
    },
    { timeoutMs: 300_000, intervalMs: 2000 },
  );

  const stopping = new AbortController();

  onTestFinished(() => {
    stopping.abort();
  });

  return { client: session.client, signal: stopping.signal };
}

test.skipIf(live.url === null || live.kubectl === null)(
  'it streams a tool call and its result through the ingress as nixie records them',
  async () => {
    const ctx = await setupTest();
    const page = await ctx.client.conversation.read({ thread: 'conversation', limit: 1 });
    const stream = await ctx.client.log.follow(
      { afterSequence: page.readAtSequence, thread: 'conversation' },
      { signal: ctx.signal },
    );
    const text = 'Use the web fetch tool to read https://example.com/ and reply with its heading.';

    await ctx.client.conversation.send({
      clientMessageId: randomUUID(),
      spans: [{ start: 0, end: text.length, source: 'typed' }],
      text,
      thread: 'conversation',
    });

    const received = await collectStepEvents(stream, () => Date.now());

    const toolEvents = received.filter((event) => event.kind.startsWith('tool_'));

    // each arrives within about a second of nixie recording it; the allowance covers the clock
    // difference between this machine and nixie's node
    expect(toolEvents).toIncludeAllPartialMembers([
      { kind: 'tool_called' },
      { kind: 'tool_result' },
    ]);
    expect(toolEvents).toSatisfyAll((event: ReceivedEvent) => event.lagMs < 2000);
  },
  360_000,
);
