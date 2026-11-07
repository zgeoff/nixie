import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { systemClock } from '@heynixie/clock';
import { createPathSource, runInForceSeed, runSeed, writeRuntimeRule } from '@heynixie/definitions';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// The rule `ask-mail` holds a runtime change, and the definitions then change the same rule, so the
// next seed lists a conflict on it. No nixie may hold the data's writer lock.
export async function seedRuleConflict(
  nixie: Pick<BootFiles, 'configPath' | 'dataDir' | 'deploymentKey'>,
): Promise<void> {
  const definitions = join(dirname(nixie.configPath), 'definitions');

  await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
  await mkdir(join(definitions, 'rules'));

  await writeFile(
    join(definitions, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const log = testLog.context.log;

    await runSeed({ log, source: createPathSource({ directory: definitions }), buildPolicy });

    await writeRuntimeRule(
      {
        log,
        clock: systemClock,
        definitions: testLog.context.definitions,
        runInForceSeed: () => runInForceSeed({ log, buildPolicy }),
      },
      {
        ruleID: 'ask-mail',
        rule: { outcome: 'deny', tools: ['mail.send'] },
        changedBy: 'owner',
        reason: 'No mail this week.',
      },
    );
  } finally {
    await testLog.writer.stop();
  }

  await writeFile(
    join(definitions, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.reply, mail.send]\n',
  );
}

function buildPolicy() {
  return { rules: [], tools: [] };
}
