import { expect, test } from 'bun:test';
import { z } from 'zod';
import { runHostCommand } from './test-utils/run-host-command';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  return nixie;
}

test('it marks a destination as a known contact and lists it with its name', async () => {
  const ctx = await setupTest();

  const marked = await runHostCommand(ctx.configPath, [
    'contacts',
    'mark-known',
    'sam@example.org',
    '--name',
    'Sam',
  ]);

  const listed = await runHostCommand(ctx.configPath, ['contacts', 'list']);

  expect(JSON.parse(listed.stdout)).toMatchObject([
    { name: 'Sam', destination: 'sam@example.org' },
  ]);

  expect(marked.exitCode).toBe(0);
});

test('it changes nothing when the destination is already held, and prints that contact', async () => {
  const ctx = await setupTest();
  const first = await runHostCommand(ctx.configPath, ['contacts', 'mark-known', 'sam@example.org']);

  const second = await runHostCommand(ctx.configPath, [
    'contacts',
    'mark-known',
    'sam@example.org',
  ]);

  const listed = await runHostCommand(ctx.configPath, ['contacts', 'list']);

  expect(second.stdout).toBe(first.stdout);
  expect(z.array(z.unknown()).parse(JSON.parse(listed.stdout))).toHaveLength(1);
});

test('it unmarks a known contact by its ID, and refuses an ID that no contact has', async () => {
  const ctx = await setupTest();

  const marked = await runHostCommand(ctx.configPath, [
    'contacts',
    'mark-known',
    'sam@example.org',
  ]);

  const contact = z.object({ contactID: z.string() }).parse(JSON.parse(marked.stdout));
  const contactID = contact.contactID;

  const unmarked = await runHostCommand(ctx.configPath, ['contacts', 'unmark', contactID]);
  const unknown = await runHostCommand(ctx.configPath, ['contacts', 'unmark', crypto.randomUUID()]);
  const listed = await runHostCommand(ctx.configPath, ['contacts', 'list']);

  expect({
    unmarked: unmarked.exitCode,
    unknown: unknown.exitCode,
    listed: z.json().parse(JSON.parse(listed.stdout)),
  }).toStrictEqual({ unmarked: 0, unknown: 1, listed: [] });
});
