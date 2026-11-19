import { expect, mock, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { startTestServer } from '../test-utils/start-test-server';
import { warnWithoutOwnerRules } from './warn-without-owner-rules';

async function setupTest() {
  const server = await startTestServer();

  const log = mock(() => {});
  const root = join(server.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  return {
    log,
    runSeed: () =>
      runSeed({
        tasks: buildTestTaskSeed(),
        log: server.context.log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
    writeRules: (text: string) => writeFile(join(root, 'rules', 'starter.yaml'), text),
    warn: () => warnWithoutOwnerRules({ context: server.context, log }),
  };
}

test('it warns when the definitions hold no rule', async () => {
  const ctx = await setupTest();

  await ctx.runSeed();
  await ctx.warn();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith(
    'policy.no_rules_in_force',
    { action: expect.stringContaining('Add rules') },
    'warn',
  );
});

test.each([
  ['an ask', 'ask-exports:\n  outcome: ask\n  effects: [export]\n'],
  ['an allow', 'allow-reads:\n  outcome: allow\n  effects: [read]\n'],
])('it logs nothing once %s of the owner is in force', async (_label, rules) => {
  const ctx = await setupTest();

  await ctx.writeRules(rules);
  await ctx.runSeed();
  await ctx.warn();

  expect(ctx.log).not.toHaveBeenCalled();
});
