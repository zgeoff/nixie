import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestNixie } from '../../../apps/server/src/test-utils/start-test-nixie';
import { createLiveSession } from './create-live-session';

// A test build of nixie's server at ready, and the kubectl stand-in, which answers the enrol-code
// host command with the code that server issued at start, as kubectl exec into nixie's pod would.
async function setupTest() {
  const nixie = await startTestNixie();
  const listening = await nixie.waitForLogEvent('http.listening');
  const issued = await nixie.waitForLogEvent('enrolment_code.issued');

  await nixie.waitForLogEvent('ready');

  const dir = await mkdtemp(join(tmpdir(), 'nixie-live-session-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const replies = join(dir, 'replies.json');

  await writeFile(
    replies,
    JSON.stringify({ 'enrol-code': `${String(issued['code'])}\nThe code works once.\n` }),
  );

  return {
    url: `http://127.0.0.1:${String(listening['port'])}`,
    kubectl: {
      argv: [process.execPath, join(import.meta.dir, 'run-stub-kubectl.ts'), '--replies', replies],
      kubeconfig: join(dir, 'kubeconfig'),
      namespace: 'nixie',
    },
  };
}

test('it enrols a device with the code from the host command, as a bearer session', async () => {
  const ctx = await setupTest();

  const session = await createLiveSession(ctx.url, ctx.kubectl);

  const listed = await session.client.sessions.list();

  expect(listed.sessions).toMatchObject([
    { sessionID: session.sessionID, deviceName: 'live check', current: true },
  ]);
}, 60_000);

test('it revokes the session it enrolled', async () => {
  const ctx = await setupTest();
  const session = await createLiveSession(ctx.url, ctx.kubectl);

  await session.revoke();

  expect(session.client.sessions.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
}, 60_000);
