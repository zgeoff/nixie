import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { systemClock } from '@heynixie/clock';
import type { DefinitionsContext } from '@heynixie/definitions';
import { createPathSource, requestDefinitionChange, runSeed } from '@heynixie/definitions';
import {
  buildTestDefineInput,
  buildTestTaskSeed,
  buildTestTaskYaml,
} from '@heynixie/definitions/test-utils';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// The definition `water-the-tomatoes` holds a runtime change, and the repo then changes the same
// definition, so the next seed finds a conflict on it. No nixie may hold the data's writer lock.
export async function seedDefinitionConflict(
  nixie: Pick<BootFiles, 'configPath' | 'dataDir' | 'deploymentKey'>,
): Promise<void> {
  const definitions = join(dirname(nixie.configPath), 'definitions');
  const folder = join(definitions, 'tasks', 'water-the-tomatoes');

  await writeFile(join(definitions, 'nixie.yaml'), 'format: 4\n');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'task.yaml'), buildTestTaskYaml({ target: 'task' }));

  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const log = testLog.context.log;
    const tasks = buildTestTaskSeed();
    const source = createPathSource({ directory: definitions });
    const runDefinitionsSeed = () => runSeed({ tasks, log, source, buildPolicy });

    await runDefinitionsSeed();

    const context: DefinitionsContext = {
      log,
      checkTaskStart: tasks.checkTaskStart,
      toolNames: tasks.toolNames,
      runSeed: runDefinitionsSeed,
      inForceSeed: { log, buildPolicy },
      onSeeded: () => null,
      wakeExport: () => null,
    };

    await requestDefinitionChange(context, {
      kind: 'define',
      input: buildTestDefineInput({
        definitionID: 'water-the-tomatoes',
        target: 'task',
        brief: 'Water them well.',
      }),
    });
  } finally {
    await testLog.writer.stop();
  }

  await writeFile(join(folder, 'task.yaml'), buildTestTaskYaml({ target: 'task', brief: 'Soak.' }));
}

function buildPolicy() {
  return { rules: [], tools: [] };
}
