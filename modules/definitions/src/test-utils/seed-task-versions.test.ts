import { expect, test } from 'bun:test';
import { startTestLog } from '@heynixie/log/test-utils';
import { startedTaskDefaultTools } from '@heynixie/tasks';
import { readDefinitionVersion } from '../task/read-definition-version';
import { seedTaskVersions } from './seed-task-versions';

async function setupTest() {
  const started = await startTestLog();

  return {
    ...started,
    readVersion: (hash: string) => readDefinitionVersion(started.writer.db, hash),
  };
}

test('it stores a version that reads back with its name, brief and defaults', async () => {
  const ctx = await setupTest();

  const [seeded] = await seedTaskVersions(ctx.writer, [
    { definitionID: 'prune-the-roses', name: 'Prune the roses', brief: 'Cut the old wood.' },
  ]);

  const version = await ctx.readVersion(seeded?.definitionHash ?? '');

  expect(version).toStrictEqual({
    definitionID: 'prune-the-roses',
    name: 'Prune the roses',
    brief: 'Cut the old wood.',
    instructions: '',
    model: null,
    profile: null,
    persona: 'default',
    memory: 'none',
    log: 'own',
    tools: startedTaskDefaultTools,
    context: 'fresh',
    wakeable: false,
    trigger: null,
  });
});
