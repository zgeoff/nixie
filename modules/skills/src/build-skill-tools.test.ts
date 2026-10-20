import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import { buildSkillTools } from './build-skill-tools';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-tools-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it builds skill_read, skill_reload, skill_reload_all, skill_write and skill_pending, which the registry accepts', async () => {
  const ctx = await setupTest();

  const tools = buildSkillTools({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => null,
    refreshDefinitions: () => Promise.resolve(null),
    readSkillList: () => [],
  });

  const registry = buildToolRegistry(tools);

  expect(tools.map((tool) => [tool.name, tool.declaration.effects])).toStrictEqual([
    ['skill_read', ['read']],
    ['skill_reload', ['note']],
    ['skill_reload_all', ['note']],
    ['skill_write', ['note']],
    ['skill_pending', ['read']],
  ]);

  expect(registry.findTool('skill_write')).not.toBeNull();
});
