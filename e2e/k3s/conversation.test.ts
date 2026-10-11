import { expect, onTestFinished, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { waitForCondition } from '../../libs/testing/src/index';
import type { LiveSession } from './test-utils/create-live-session';
import { createLiveSession } from './test-utils/create-live-session';
import { findTurnRecords } from './test-utils/find-turn-records';
import { hasKindsInOrder } from './test-utils/has-kinds-in-order';
import { isStepInFlight } from './test-utils/is-step-in-flight';
import { parseLiveEnv } from './test-utils/parse-live-env';
import { requireLiveValue } from './test-utils/require-live-value';

// A live check against a deployed nixie, which docs/runbooks/live-checks.md runs. It skips unless
// the URL and the kubeconfig are set.
const live = parseLiveEnv(process.env);

type Page = Awaited<ReturnType<LiveSession['client']['conversation']['read']>>;

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

  return { client: session.client, sessionID: session.sessionID };
}

test.skipIf(live.url === null || live.kubectl === null)(
  'it answers a message with a reply that used the web fetch, with each step in the event log',
  async () => {
    const ctx = await setupTest();
    const sessions = await ctx.client.sessions.list();
    const text =
      'Use the web fetch tool to read https://example.com/ and reply with the page’s heading only.';

    const sent = await ctx.client.conversation.send({
      clientMessageId: randomUUID(),
      spans: [{ start: 0, end: text.length, source: 'typed' }],
      text,
      thread: 'conversation',
    });
    const turn: { records: Readonly<Page['records']> | null } = { records: null };

    // a cold conversation imp starts before the turn, and the turn waits on the model and the page
    await waitForCondition(
      async () => {
        const page = await ctx.client.conversation.read({ thread: 'conversation', limit: 200 });

        turn.records = findTurnRecords(page.records, sent.sequence);
        return turn.records !== null;
      },
      { timeoutMs: 300_000, intervalMs: 2000 },
    );
    const records = turn.records ?? [];
    const reply = records.findLast((record) => record.kind === 'model.reply');

    expect(sessions.sessions).toPartiallyContain({ sessionID: ctx.sessionID, current: true });
    expect(sent.duplicate).toBeFalse();
    expect(
      hasKindsInOrder(records, [
        'owner_message',
        'task.step_started',
        'tool_called',
        'tool_result',
        'model.reply',
        'task.step_committed',
      ]),
    ).toBeTrue();
    expect(records.map((record) => record.kind)).not.toContain('task.step_errored');
    expect(reply?.message?.text).toInclude('Example Domain');
  },
  360_000,
);
