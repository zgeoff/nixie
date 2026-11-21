import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DefinitionsContext } from '@heynixie/definitions';
import { createPathSource, requestDefinitionChange, runSeed } from '@heynixie/definitions';
import { buildTestDefineInput, buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import invariant from 'tiny-invariant';
import type { startTestAPI } from './start-test-api';

type TestAPI = Awaited<ReturnType<typeof startTestAPI>>;

// The runtime changes of task definitions over the API's own log, with a seeded repo
export async function startTestAPIDefinitions(api: TestAPI) {
  const root = join(api.dataDir, 'definitions');

  await mkdir(join(root, 'tasks'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const log = api.context.log;
  const tasks = buildTestTaskSeed();
  const source = createPathSource({ directory: root });
  const seed = () => runSeed({ tasks, log, source, buildPolicy: () => ({ rules: [], tools: [] }) });

  await seed();

  const context: DefinitionsContext = {
    log,
    checkTaskStart: tasks.checkTaskStart,
    toolNames: tasks.toolNames,
    runSeed: seed,
    inForceSeed: { log, buildPolicy: () => ({ rules: [], tools: [] }) },
    onSeeded: () => {},
    wakeExport: () => {},
  };

  return {
    context,
    seed,
    writeRepoTask: async (brief: string) => {
      await mkdir(join(root, 'tasks', 'water-the-tomatoes'), { recursive: true });

      await writeFile(
        join(root, 'tasks', 'water-the-tomatoes', 'task.yaml'),
        `name: Water the tomatoes\nbrief: ${brief}\ntrigger:\n  schedule:\n    repeat:\n      frequency: weekly\n      byDay: [fri]\n      at: ["08:00"]\n      starts: "2026-11-20"\n`,
      );
    },
    define: async (overrides: Parameters<typeof buildTestDefineInput>[0] = {}) => {
      const result = await requestDefinitionChange(context, {
        kind: 'define',
        input: buildTestDefineInput(overrides),
      });

      invariant(result.status === 'changed');

      return result;
    },
  };
}
