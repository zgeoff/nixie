import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSkillFiles, createPathSource, writeWrittenSkill } from '@heynixie/definitions';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStartState } from './build-start-state';
import { createServerContext } from './create-server-context';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { SeedParts } from './run-queued-seed';
import { runWrittenSkillsSeed } from './run-written-skills-seed';
import { buildStubHeldSource } from './test-utils/build-stub-held-source';
import { startTestLog } from './test-utils/start-test-log';

// a fresh log, the definitions in force over it, and a definitions folder beside it
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-written-skills-seed-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);

  const context = await createServerContext(log.writer, log.deploymentKey, () => null);

  return { root, context };
}

test("it queues an approval's seed behind a definitions seed in flight, and the approved skill ends in force", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const plain: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    policy: { rules: [], tools: [] },
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  await runDefinitionsSeed(plain);

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.context.apiContext.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const stub = buildStubHeldSource(createPathSource({ directory: ctx.root }));
  const held = { ...plain, source: stub.source };
  const seeds = [runDefinitionsSeed(held), runWrittenSkillsSeed(held)];

  stub.release();

  const results = await Promise.all(seeds);

  expect(results.map((result) => result.status)).toStrictEqual(['seeded', 'unchanged']);

  expect(ctx.context.inForce.read()?.skills).toStrictEqual([
    { name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' },
  ]);
});
