import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runToolListProbe } from '@heynixie/conversation/sdk-contract';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-tool-list-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it calls a tool in its changed form on the next turn of a resumed session',
  async () => {
    const ctx = await setupTest();
    const run = await runToolListProbe(ctx.target, 'resumed-session');

    expect(run.calls).toStrictEqual([
      { name: 'note_read', arguments: { name: 'groceries' } },
      { name: 'note_read', arguments: { noteID: 'n7k2' } },
    ]);
  },
  20_000,
);

test.skipIf(!isContractRun)(
  'it keeps the recorded form of a tool on a resumed session that snapshots its system prompt',
  async () => {
    const ctx = await setupTest();
    const run = await runToolListProbe(ctx.target, 'resumed-snapshot');

    expect(run.calls).toStrictEqual([
      { name: 'note_read', arguments: { name: 'groceries' } },
      { name: 'note_read', arguments: { name: 'groceries' } },
    ]);
  },
  16_000,
);

test.skipIf(!isContractRun)(
  'it calls a tool in its listed form at the next step of a turn when the server sends no notice',
  async () => {
    const ctx = await setupTest();
    const run = await runToolListProbe(ctx.target, 'mid-turn-silent');

    expect(run.calls).toStrictEqual([
      { name: 'note_wait', arguments: {} },
      { name: 'note_read', arguments: { name: 'groceries' } },
    ]);
  },
  13_000,
);

test.skipIf(!isContractRun)(
  'it calls a tool in its changed form at the next step of a turn once it lists the tools after a notice',
  async () => {
    const ctx = await setupTest();
    const run = await runToolListProbe(ctx.target, 'mid-turn-notice');

    expect(run.calls).toStrictEqual([
      { name: 'note_wait', arguments: {} },
      { name: 'note_read', arguments: { noteID: 'n7k2' } },
    ]);
  },
  18_000,
);
